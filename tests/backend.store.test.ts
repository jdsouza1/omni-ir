// The Store contract (PLAN-BACKEND.md C.1): the in-memory store and the one on Node's built-in SQLite
// must behave identically, so the same tests run against both.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryStore } from "../server/backend/memoryStore";
import { createSqliteStore } from "../server/backend/sqliteStore";
import { KEY_TTL_MS, type Store } from "../server/backend/types";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const stores: [string, () => Store][] = [
  ["memory", () => createMemoryStore()],
  ["sqlite (in memory)", () => createSqliteStore(":memory:")],
];

describe.each(stores)("%s store", (_, make) => {
  let store: Store;
  beforeEach(() => {
    store = make();
  });

  it("creates a user once per email, case-insensitively", async () => {
    const a = await store.users.ensure("Ada@Example.com");
    const again = await store.users.ensure("ada@example.com");
    expect(again.id).toBe(a.id);
    expect(a.email).toBe("ada@example.com");
    expect(await store.users.byEmail("ADA@example.com")).toEqual(a);
    expect(await store.users.byId(a.id)).toEqual(a);
    expect(await store.users.byId("nobody")).toBeNull();
  });

  it("finds a session until it expires or is deleted", async () => {
    const user = await store.users.ensure("ada@example.com");
    await store.sessions.create("hash-1", user.id, 1000);
    expect(await store.sessions.userOf("hash-1", 999)).toBe(user.id);
    expect(await store.sessions.userOf("hash-1", 1000)).toBeNull();
    await store.sessions.create("hash-2", user.id, 5000);
    await store.sessions.delete("hash-2");
    expect(await store.sessions.userOf("hash-2", 1)).toBeNull();
    expect(await store.sessions.userOf("unknown", 1)).toBeNull();
  });

  it("uses a sign-in link once, and not after it expires", async () => {
    await store.links.create("link-1", "ada@example.com", 0, 1000);
    expect(await store.links.take("link-1", 500)).toBe("ada@example.com");
    expect(await store.links.take("link-1", 500)).toBeNull();
    await store.links.create("link-2", "ada@example.com", 400, 1000);
    expect(await store.links.take("link-2", 1000)).toBeNull();
    expect(await store.links.countSince("ada@example.com", -1)).toBe(2);
    expect(await store.links.countSince("ada@example.com", 0)).toBe(1);
    expect(await store.links.countSince("Ada@example.com", 400)).toBe(0);
  });

  it("requests an order's return once", async () => {
    await store.orders.add({ id: "A1B2-7731", ownerId: "u1", item: "Linen shirt", total: 45 });
    expect(await store.orders.get("A1B2-7731")).toEqual({ id: "A1B2-7731", ownerId: "u1", item: "Linen shirt", total: 45 });
    expect(await store.orders.get("NOPE")).toBeNull();
    expect(await store.returns.request("A1B2-7731", "u1", "ret_1")).toEqual({ id: "ret_1", created: true });
    expect(await store.returns.request("A1B2-7731", "u1", "ret_2")).toEqual({ id: "ret_1", created: false });
  });

  it("books the cabin only for nights nobody else has", async () => {
    const book = (id: string, checkIn: string, checkOut: string) => store.bookings.reserve({ id, ownerId: "u1", checkIn, checkOut });
    expect(await book("b1", "2026-10-14", "2026-10-17")).toBe(true);
    expect(await book("b2", "2026-10-16", "2026-10-18")).toBe(false); // overlaps the 16th
    expect(await book("b3", "2026-10-10", "2026-10-15")).toBe(false); // overlaps the 14th
    expect(await book("b4", "2026-10-17", "2026-10-19")).toBe(true); // checks in the day the first checks out
    expect(await book("b5", "2026-10-12", "2026-10-14")).toBe(true); // checks out the day the first checks in
  });

  it("keeps one answer per idempotency key and scope, for 24 hours", async () => {
    const { idempotency: keys } = store;
    expect(await keys.claim("u1", "k1", "fp-a", 0)).toEqual({ state: "new" });
    expect(await keys.claim("u1", "k1", "fp-a", 1)).toEqual({ state: "pending" });
    await keys.finish("u1", "k1", 200, { ok: true, n: 1 });
    expect(await keys.claim("u1", "k1", "fp-a", 2)).toEqual({ state: "done", status: 200, body: { ok: true, n: 1 } });
    expect(await keys.claim("u1", "k1", "fp-b", 2)).toEqual({ state: "conflict" });
    expect(await keys.claim("u2", "k1", "fp-b", 2)).toEqual({ state: "new" }); // another person's key space
    expect(await keys.claim("u1", "k1", "fp-b", KEY_TTL_MS + 1)).toEqual({ state: "new" }); // expired
    expect(await keys.claim("u1", "k2", "fp-a", 0)).toEqual({ state: "new" });
    await keys.release("u1", "k2");
    expect(await keys.claim("u1", "k2", "fp-a", 0)).toEqual({ state: "new" });
  });

  it("writes everything else, and keeps the audit trail in order", async () => {
    await store.tickets.add({ id: "t1", ownerId: "u1", subject: "Refund", message: "Please" });
    await store.profiles.put("u1", { displayName: "Ada", bio: "" });
    await store.profiles.put("u1", { displayName: "Ada L.", bio: "Hi" });
    await store.settings.put("u1", { language: "English", orderUpdates: true, promotions: false });
    await store.payments.add({ id: "p1", ownerId: "u1", amount: 42.5, note: "", at: 1 });
    await store.audit.add({ at: 1, userId: "u1", tool: "payments.confirm", outcome: "ok", idempotencyKey: "k" });
    await store.audit.add({ at: 2, userId: null, tool: "auth.sendMagicLink", outcome: "ok", idempotencyKey: null });
    expect((await store.audit.list()).map((e) => e.tool)).toEqual(["payments.confirm", "auth.sendMagicLink"]);
  });

  it("keeps model checks, and finds a setup's latest pass since a given time (PLAN-MODELCHECK.md)", async () => {
    const check = { fingerprint: "f1", model: "m", reason: "start" as const, requests: ["a", "b"], total: 2, safe: 2, complete: 2, error: null };
    await store.modelChecks.add({ ...check, at: 10, passed: true });
    await store.modelChecks.add({ ...check, at: 20, passed: true });
    await store.modelChecks.add({ ...check, at: 30, passed: false, safe: 1, error: "model_error" });
    await store.modelChecks.add({ ...check, at: 40, passed: true, fingerprint: "f2" });
    expect((await store.modelChecks.latestPass("f1", 0))?.at).toBe(20);
    expect(await store.modelChecks.latestPass("f1", 21)).toBeNull();
    expect(await store.modelChecks.latestPass("f3", 0)).toBeNull();
    const all = await store.modelChecks.list();
    expect(all.map((r) => r.at)).toEqual([10, 20, 30, 40]);
    expect(all[2]).toEqual({ ...check, at: 30, passed: false, safe: 1, error: "model_error" });
  });
});

describe("sqlite store on disk", () => {
  it("keeps its data after it is closed and opened again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omni-store-"));
    dirs.push(dir);
    const file = join(dir, "omni.sqlite");
    const first = createSqliteStore(file);
    const user = await first.users.ensure("ada@example.com");
    await first.bookings.reserve({ id: "b1", ownerId: user.id, checkIn: "2026-10-14", checkOut: "2026-10-17" });
    first.close?.();
    const second = createSqliteStore(file);
    expect(await second.users.byEmail("ada@example.com")).toEqual(user);
    expect(await second.bookings.reserve({ id: "b2", ownerId: user.id, checkIn: "2026-10-15", checkOut: "2026-10-16" })).toBe(false);
    second.close?.();
  });
});

describe("OMNI_DB", () => {
  it("keeps the server's data in that SQLite file across restarts", async () => {
    const { startServer } = await import("./serverHelpers");
    const { MockModel } = await import("../server/models/mock");
    const dir = mkdtempSync(join(tmpdir(), "omni-db-"));
    dirs.push(dir);
    const dbPath = join(dir, "omni.sqlite");
    const book = async (checkIn: string, checkOut: string) => {
      const server = await startServer({ model: new MockModel({ speed: "instant" }), config: { dbPath } });
      const response = await fetch(`${server.url}/api/mutate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: "bookings.reserve", params: { checkIn, checkOut } }),
      });
      await server.close();
      return response.status;
    };
    expect(await book("2026-12-01", "2026-12-04")).toBe(200);
    expect(await book("2026-12-02", "2026-12-03")).toBe(409); // a new server, the same file
  });
});
