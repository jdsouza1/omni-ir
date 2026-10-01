import { TOOLS } from "../app/tools";
import { MockModel } from "../server/models/mock";
import { STUB_HANDLERS, type ToolHandler } from "../server/tools/handlers";
import { startServer } from "./serverHelpers";

let server: Awaited<ReturnType<typeof startServer>> | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(handlers?: Record<string, ToolHandler>) {
  server = await startServer({ model: new MockModel({ speed: "instant" }), ...(handlers ? { handlers } : {}) });
  return (body: unknown) =>
    fetch(`${server!.url}/api/mutate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

describe("stub handlers", () => {
  it("cover exactly the tools in the registry", () => {
    expect(Object.keys(STUB_HANDLERS).sort()).toEqual(Object.keys(TOOLS).sort());
  });
});

describe("POST /api/mutate", () => {
  it.each([
    ["payments.confirm", { amount: 42.5, note: "Table 4" }, "receiptId"],
    ["auth.sendMagicLink", { email: "ada@example.com" }, "sent"],
    ["profile.update", { displayName: "Ada", bio: "Hello" }, "saved"],
    ["orders.requestReturn", { orderId: "A1B2-7731" }, "returnId"],
    ["support.createTicket", { subject: "Refund", message: "Please help" }, "ticketId"],
    ["bookings.reserve", { checkIn: "2026-10-14", checkOut: "2026-10-17" }, "bookingId"],
    ["assistant.ask", { question: "Any quiet beaches?" }, "answer"],
  ])("%s with valid params → 200 with a stub result", async (tool, params, field) => {
    const mutate = await start();
    const response = await mutate({ tool, params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; tool: string; result: Record<string, unknown> };
    expect(body).toMatchObject({ ok: true, tool, result: { stub: true } });
    expect(body.result).toHaveProperty(field);
  });

  it.each([
    ["not in the registry", "system.delete_account"],
    ["inherited from Object.prototype", "constructor"],
    ["prototype setter", "__proto__"],
  ])("unknown tool (%s) → 403, no handler runs", async (_, tool) => {
    const handler = vi.fn<ToolHandler>(async () => ({}));
    const mutate = await start({ ...STUB_HANDLERS, [tool]: handler });
    const response = await mutate({ tool, params: {} });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "unknown_tool" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ["note over 500 characters", { amount: 42.5, note: "x".repeat(600) }, "note"],
    ["negative amount", { amount: -1, note: "" }, "amount"],
    ["missing param", { amount: 42.5 }, "note"],
    ["extra param", { amount: 42.5, note: "", currency: "USD" }, ""],
    ["wrong type", { amount: "42.50", note: "" }, "amount"],
  ])("invalid params (%s) → 422, no handler runs", async (_, params, path) => {
    const handler = vi.fn<ToolHandler>(async () => ({}));
    const mutate = await start({ ...STUB_HANDLERS, "payments.confirm": handler });
    const response = await mutate({ tool: "payments.confirm", params });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { code: string; issues: { path: string }[] } };
    expect(body.error.code).toBe("invalid_params");
    if (path) expect(body.error.issues.map((i) => i.path)).toContain(path);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ["a date in another format", { checkIn: "14/10/2026", checkOut: "2026-10-17" }, "checkIn"],
    ["check-out before check-in", { checkIn: "2026-10-17", checkOut: "2026-10-14" }, "checkOut"],
    ["check-out on the check-in day", { checkIn: "2026-10-14", checkOut: "2026-10-14" }, "checkOut"],
  ])("bookings.reserve with %s → 422", async (_, params, path) => {
    const mutate = await start();
    const response = await mutate({ tool: "bookings.reserve", params });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: { issues: { path: string }[] } };
    expect(body.error.issues.map((i) => i.path)).toContain(path);
  });

  it("rejects a __proto__ key in params → 422", async () => {
    const mutate = await start();
    const response = await mutate('{"tool":"payments.confirm","params":{"amount":1,"note":"","__proto__":{"admin":true}}}');
    expect(response.status).toBe(422);
  });

  it.each([
    ["missing tool", { params: {} }],
    ["params not an object", { tool: "payments.confirm", params: [1, 2] }],
    ["unknown top-level field", { tool: "payments.confirm", params: {}, userId: "admin" }],
    ["malformed JSON", "{ nope"],
  ])("bad request body (%s) → 400", async (_, body) => {
    const mutate = await start();
    const response = await mutate(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
  });

  it("a failing handler → 500 with a generic message", async () => {
    const mutate = await start({
      ...STUB_HANDLERS,
      "payments.confirm": async () => {
        throw new Error("card processor key sk_live_123 rejected");
      },
    });
    const response = await mutate({ tool: "payments.confirm", params: { amount: 1, note: "" } });
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("sk_live_123");
    expect(JSON.parse(text)).toMatchObject({ error: { code: "tool_failed" } });
  });

  it("rate limits requests for unknown tools too", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }), config: { rateLimitPerMinute: 1 } });
    const probe = () =>
      fetch(`${server!.url}/api/mutate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: `guess.${Math.random().toString(36).slice(2)}`, params: {} }),
      });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await probe()).status);
    expect(statuses).toEqual([403, 403, 403, 429]);
  });

  it("logs the tool and outcome but never param values", async () => {
    const mutate = await start();
    await mutate({ tool: "auth.sendMagicLink", params: { email: "secret.person@example.com" } });
    await mutate({ tool: "payments.confirm", params: { amount: 1, note: "x".repeat(600) } });
    const logs = JSON.stringify(server!.logs);
    expect(logs).not.toContain("secret.person");
    expect(logs).not.toContain("xxxxxxxx");
    expect(server!.logs).toContainEqual(expect.objectContaining({ event: "mutate", tool: "auth.sendMagicLink", outcome: "ok" }));
    expect(server!.logs).toContainEqual(expect.objectContaining({ event: "mutate", tool: "payments.confirm", outcome: "invalid_params" }));
  });
});
