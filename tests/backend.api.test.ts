// The reference backend end to end (PLAN-BACKEND.md A-E): sign-in by emailed link, sessions for
// browsers and native apps, access rules, ownership, idempotency keys, and attacks across two
// signed-in people. Everything runs against the real Express app with an in-memory store and the
// development mail outbox; nothing leaves the process.
import { TOOLS } from "../app/tools";
import { createMemoryStore } from "../server/backend/memoryStore";
import { createDevMailer } from "../server/backend/auth";
import type { Store } from "../server/backend/types";
import { MockModel } from "../server/models/mock";
import { HANDLERS } from "../server/tools/handlers";
import { startServer } from "./serverHelpers";

const ORIGIN = "http://localhost:5173";
let server: Awaited<ReturnType<typeof startServer>> | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

/** A signed-in-by-link server with a clock the test controls, and helpers to act as people. */
async function setup(config: Record<string, unknown> = {}) {
  let clock = 1_800_000_000_000;
  const store: Store = createMemoryStore();
  const mailer = createDevMailer();
  server = await startServer({
    model: new MockModel({ speed: "instant" }),
    config: { auth: "magic-link", publicUrl: ORIGIN, ...config },
    store,
    mailer,
    now: () => clock,
  });
  const url = server.url;

  const call = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    fetch(`${url}${path}`, { redirect: "manual", ...init });
  const json = (body: unknown, headers: Record<string, string> = {}) => ({
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });

  /** Ask for a link, then follow it as a browser: returns the session cookie. */
  async function signIn(email: string): Promise<string> {
    await call("/api/mutate", json({ tool: "auth.sendMagicLink", params: { email } }));
    const link = mailer.sent.at(-1)!.link;
    const response = await call(new URL(link).pathname + new URL(link).search);
    expect(response.status).toBe(303);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^omni_session=[^;]+;/);
    return cookie.split(";")[0]!;
  }

  const mutate = (cookie: string | null, tool: string, params: unknown, headers: Record<string, string> = {}) =>
    call("/api/mutate", json({ tool, params }, { ...(cookie ? { cookie } : {}), ...headers }));

  return { store, mailer, call, json, signIn, mutate, tick: (ms: number) => (clock += ms), now: () => clock };
}

describe("every tool has an access rule [PLAN A.2]", () => {
  it("has a handler with an access rule for exactly the registered tools; only the sign-in link is public", () => {
    expect(Object.keys(HANDLERS).sort()).toEqual(Object.keys(TOOLS).sort());
    for (const [tool, handler] of Object.entries(HANDLERS)) expect(["public", "signed-in"], tool).toContain(handler.access);
    expect(Object.entries(HANDLERS).filter(([, h]) => h.access === "public").map(([t]) => t)).toEqual(["auth.sendMagicLink"]);
  });

  it("answers 401 sign_in_required to a signed-out call, without running anything", async () => {
    const s = await setup();
    for (const tool of Object.keys(TOOLS).filter((t) => t !== "auth.sendMagicLink")) {
      const response = await s.mutate(null, tool, {});
      expect(response.status, tool).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: "sign_in_required", retryable: false } });
    }
    expect((await s.store.audit.list()).every((e) => e.outcome === "sign_in_required")).toBe(true);
  });
});

describe("sign-in by emailed link", () => {
  it("emails a link to the development outbox and gives the same answer whether or not the address has an account", async () => {
    const s = await setup();
    await s.store.users.ensure("ada@example.com");
    const known = await (await s.mutate(null, "auth.sendMagicLink", { email: "ada@example.com" })).json();
    const unknown = await (await s.mutate(null, "auth.sendMagicLink", { email: "new.person@example.com" })).json();
    expect(known).toEqual(unknown);
    expect(known).toEqual({ ok: true, tool: "auth.sendMagicLink", result: { sent: true } });
    expect(s.mailer.sent.map((m) => m.to)).toEqual(["ada@example.com", "new.person@example.com"]);
    expect(s.mailer.sent[0]!.link).toMatch(new RegExp(`^${ORIGIN}/api/auth/callback\\?token=[A-Za-z0-9_-]{43}$`));
  });

  it("signs in with an HttpOnly, SameSite cookie, and /api/auth/me says who", async () => {
    const s = await setup();
    await s.mutate(null, "auth.sendMagicLink", { email: "Ada@Example.com" });
    const link = new URL(s.mailer.sent[0]!.link);
    const response = await s.call(link.pathname + link.search);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    const me = await (await s.call("/api/auth/me", { headers: { cookie: cookie.split(";")[0]! } })).json();
    expect(me).toEqual({ user: { email: "ada@example.com" } });
    expect(await (await s.call("/api/auth/me")).json()).toEqual({ user: null });
  });

  it("uses each link once, and not after 15 minutes", async () => {
    const s = await setup();
    await s.mutate(null, "auth.sendMagicLink", { email: "ada@example.com" });
    const link = new URL(s.mailer.sent[0]!.link);
    expect((await s.call(link.pathname + link.search)).status).toBe(303);
    const again = await s.call(link.pathname + link.search);
    expect(again.headers.get("location")).toBe("/?signin=expired");
    expect(again.headers.get("set-cookie")).toBeNull();

    await s.mutate(null, "auth.sendMagicLink", { email: "ada@example.com" });
    const late = new URL(s.mailer.sent[1]!.link);
    s.tick(15 * 60 * 1000);
    expect((await s.call(late.pathname + late.search)).headers.get("location")).toBe("/?signin=expired");
    expect((await s.call("/api/auth/callback?token=forged")).headers.get("location")).toBe("/?signin=expired");
  });

  it("sends at most 5 links an hour to one address, answering the same either way", async () => {
    const s = await setup();
    for (let i = 0; i < 7; i++) {
      expect(await (await s.mutate(null, "auth.sendMagicLink", { email: "ada@example.com" })).json()).toMatchObject({ result: { sent: true } });
    }
    expect(s.mailer.sent).toHaveLength(5);
    s.tick(60 * 60 * 1000 + 1);
    await s.mutate(null, "auth.sendMagicLink", { email: "ada@example.com" });
    expect(s.mailer.sent).toHaveLength(6);
  });

  it("gives a native app a bearer token for the link, and signing out ends the session", async () => {
    const s = await setup();
    await s.mutate(null, "auth.sendMagicLink", { email: "ada@example.com" });
    const token = new URL(s.mailer.sent[0]!.link).searchParams.get("token");
    const session = await s.call("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    expect(session.status).toBe(200);
    expect(session.headers.get("set-cookie")).toBeNull();
    const { token: bearer } = (await session.json()) as { token: string };
    const auth = { authorization: `Bearer ${bearer}` };
    // Native apps send no Origin header; a bearer token is not sent automatically by browsers, so none is needed.
    const ok = await s.call("/api/mutate", { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify({ tool: "profile.update", params: { displayName: "Ada", bio: "" } }) });
    expect(ok.status).toBe(200);
    expect((await s.call("/api/auth/signout", { method: "POST", headers: auth })).status).toBe(204);
    const after = await s.call("/api/mutate", { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify({ tool: "profile.update", params: { displayName: "Ada", bio: "" } }) });
    expect(after.status).toBe(401);
  });

  it("signs a browser out: the cookie is cleared and the session no longer works", async () => {
    const s = await setup();
    const cookie = await s.signIn("ada@example.com");
    const out = await s.call("/api/auth/signout", { method: "POST", headers: { cookie, origin: ORIGIN } });
    expect(out.status).toBe(204);
    expect(out.headers.get("set-cookie")).toMatch(/omni_session=;.*Max-Age=0/i);
    expect((await s.mutate(cookie, "profile.update", { displayName: "Ada", bio: "" })).status).toBe(401);
  });

  it("expires sessions after 30 days", async () => {
    const s = await setup();
    const cookie = await s.signIn("ada@example.com");
    s.tick(30 * 24 * 60 * 60 * 1000);
    expect((await s.mutate(cookie, "profile.update", { displayName: "Ada", bio: "" })).status).toBe(401);
  });
});

describe("cross-site requests", () => {
  it("refuses a cookie-authenticated action from another origin, or without an Origin header", async () => {
    const s = await setup();
    const cookie = await s.signIn("ada@example.com");
    for (const origin of ["https://evil.example", "null", undefined]) {
      const headers: Record<string, string> = { "content-type": "application/json", cookie };
      if (origin !== undefined) headers.origin = origin;
      const response = await s.call("/api/mutate", { method: "POST", headers, body: JSON.stringify({ tool: "payments.confirm", params: { amount: 5, note: "" } }) });
      expect(response.status, String(origin)).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "bad_origin" } });
    }
    expect((await s.mutate(cookie, "payments.confirm", { amount: 5, note: "" })).status).toBe(200);
  });
});

describe("ownership: one person can never act on another's data", () => {
  async function twoPeople() {
    const s = await setup();
    const ada = await s.signIn("ada@example.com");
    const grace = await s.signIn("grace@example.com");
    const adaUser = (await s.store.users.byEmail("ada@example.com"))!;
    const graceUser = (await s.store.users.byEmail("grace@example.com"))!;
    await s.store.orders.add({ id: "A1B2-7731", ownerId: adaUser.id, item: "Linen shirt", total: 45 });
    await s.store.orders.add({ id: "C3D4-1188", ownerId: graceUser.id, item: "Canvas tote", total: 25 });
    return { ...s, ada, grace, adaUser, graceUser };
  }

  it("answers 404 not_found, the same for someone else's order as for one that doesn't exist", async () => {
    const s = await twoPeople();
    const theirs = await s.mutate(s.grace, "orders.requestReturn", { orderId: "A1B2-7731" });
    const missing = await s.mutate(s.grace, "orders.requestReturn", { orderId: "ZZZZ-0000" });
    expect(theirs.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await theirs.json()).toEqual(await missing.json());
    const own = await s.mutate(s.ada, "orders.requestReturn", { orderId: "A1B2-7731" });
    expect(own.status).toBe(200);
  });

  it("requests a return once: asking again gives the same return", async () => {
    const s = await twoPeople();
    const first = (await (await s.mutate(s.ada, "orders.requestReturn", { orderId: "A1B2-7731" })).json()) as { result: { returnId: string } };
    const second = (await (await s.mutate(s.ada, "orders.requestReturn", { orderId: "A1B2-7731" })).json()) as { result: { returnId: string } };
    expect(second.result.returnId).toBe(first.result.returnId);
  });

  it("books the cabin only for free nights: 409 unavailable otherwise", async () => {
    const s = await twoPeople();
    expect((await s.mutate(s.ada, "bookings.reserve", { checkIn: "2026-10-14", checkOut: "2026-10-17" })).status).toBe(200);
    const taken = await s.mutate(s.grace, "bookings.reserve", { checkIn: "2026-10-15", checkOut: "2026-10-18" });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ error: { code: "unavailable", retryable: false } });
  });

  it("returns only what the screen needs: no owner ids, no email addresses, nobody else's data", async () => {
    const s = await twoPeople();
    const answers = [
      await s.mutate(s.ada, "payments.confirm", { amount: 42.5, note: "Table 4" }),
      await s.mutate(s.ada, "orders.requestReturn", { orderId: "A1B2-7731" }),
      await s.mutate(s.ada, "bookings.reserve", { checkIn: "2026-11-01", checkOut: "2026-11-03" }),
      await s.mutate(s.ada, "support.createTicket", { subject: "Refund", message: "Please help" }),
      await s.mutate(s.ada, "profile.update", { displayName: "Ada", bio: "Hi" }),
      await s.mutate(s.ada, "settings.update", { language: "English", orderUpdates: true, promotions: false }),
    ];
    for (const response of answers) {
      expect(response.status).toBe(200);
      const text = await response.text();
      for (const secret of [s.adaUser.id, s.graceUser.id, "grace@example.com", "ada@example.com", "ownerId", "C3D4-1188"]) expect(text).not.toContain(secret);
    }
  });

  it("can't be fooled by ids, emails or owners written into the params", async () => {
    const s = await twoPeople();
    for (const params of [
      { orderId: "C3D4-1188", ownerId: s.adaUser.id },
      { orderId: "C3D4-1188", userId: s.adaUser.id },
    ]) {
      const response = await s.mutate(s.ada, "orders.requestReturn", params);
      expect(response.status, JSON.stringify(params)).toBe(422); // unknown keys are rejected by the schema
    }
    expect((await s.mutate(s.ada, "orders.requestReturn", { orderId: "C3D4-1188" })).status).toBe(404);
  });
});

describe("idempotency keys [10.14]", () => {
  it("runs an action once per key: a repeat gets the stored answer and no second payment", async () => {
    const s = await setup();
    const cookie = await s.signIn("ada@example.com");
    const key = { "idempotency-key": "press-1" };
    const first = await s.mutate(cookie, "payments.confirm", { amount: 42.5, note: "" }, key);
    const second = await s.mutate(cookie, "payments.confirm", { amount: 42.5, note: "" }, key);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = await first.json();
    expect(await second.json()).toEqual(a);
    const payments = (await s.store.audit.list()).filter((e) => e.tool === "payments.confirm");
    expect(payments.map((e) => e.outcome)).toEqual(["ok", "replayed"]);
  });

  it("refuses a key reused for different params with 409 idempotency_conflict", async () => {
    const s = await setup();
    const cookie = await s.signIn("ada@example.com");
    const key = { "idempotency-key": "press-2" };
    await s.mutate(cookie, "payments.confirm", { amount: 42.5, note: "" }, key);
    const reused = await s.mutate(cookie, "payments.confirm", { amount: 4250, note: "" }, key);
    expect(reused.status).toBe(409);
    expect(await reused.json()).toMatchObject({ error: { code: "idempotency_conflict", retryable: false } });
  });

  it("keeps each person's keys apart, so someone else's key can't fetch their answer", async () => {
    const s = await setup();
    const ada = await s.signIn("ada@example.com");
    const grace = await s.signIn("grace@example.com");
    const key = { "idempotency-key": "shared-key" };
    const adaPaid = await (await s.mutate(ada, "payments.confirm", { amount: 42.5, note: "" }, key)).json();
    const gracePaid = await (await s.mutate(grace, "payments.confirm", { amount: 42.5, note: "" }, key)).json();
    expect(gracePaid).not.toEqual(adaPaid); // a separate payment with its own receipt
  });

  it("answers 400 for a malformed key, and works without one", async () => {
    const s = await setup();
    const cookie = await s.signIn("ada@example.com");
    for (const bad of ["", "x".repeat(201), "has spaces", "ümlaut"]) {
      expect((await s.mutate(cookie, "payments.confirm", { amount: 1, note: "" }, { "idempotency-key": bad })).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await s.mutate(cookie, "payments.confirm", { amount: 1, note: "" })).status).toBe(200);
  });
});

describe("personal data and limits [PLAN E]", () => {
  it("keeps param values out of the audit trail and the log; records who, what and the outcome", async () => {
    const s = await setup();
    const cookie = await s.signIn("secret.person@example.com");
    await s.mutate(cookie, "support.createTicket", { subject: "My card ends 4242", message: "Call me on 555-0100" });
    const trail = JSON.stringify(await s.store.audit.list());
    const logs = JSON.stringify(server!.logs);
    for (const secret of ["secret.person", "4242", "555-0100"]) {
      expect(trail).not.toContain(secret);
      expect(logs).not.toContain(secret);
    }
    const user = (await s.store.users.byEmail("secret.person@example.com"))!;
    expect(await s.store.audit.list()).toContainEqual(expect.objectContaining({ userId: user.id, tool: "support.createTicket", outcome: "ok" }));
  });

  it("limits each signed-in person, even across addresses", async () => {
    const s = await setup({ rateLimitPerMinute: 2, trustProxy: ["loopback"] });
    const cookie = await s.signIn("ada@example.com"); // one mutate, from 127.0.0.1
    const statuses: number[] = [];
    for (const ip of ["203.0.113.1", "203.0.113.2", "203.0.113.3", "203.0.113.4", "203.0.113.5", "203.0.113.6", "203.0.113.7"]) {
      statuses.push((await s.mutate(cookie, "profile.update", { displayName: "Ada", bio: "" }, { "x-forwarded-for": ip })).status);
    }
    expect(statuses).toContain(429);
  });
});
