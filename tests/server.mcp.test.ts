// Step 18 (PLAN-MCPAPPS.md, B.2, B.4, B.5): the reference server's MCP endpoint, through the official
// MCP client over HTTP. Actions run through the same checks as /api/mutate: access rules, ownership,
// idempotency keys and the audit trail. Mock data only.
import { afterEach, describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { IDEMPOTENCY_META_KEY, SCREEN_TOOL, VIEW_URI } from "@omni-ir/mcp";
import { createDevMailer } from "../server/backend/auth";
import { createMemoryStore } from "../server/backend/memoryStore";
import { seedDemo } from "../server/backend/seed";
import { MockModel } from "../server/models/mock";
import { startServer } from "./serverHelpers";

const ORIGIN = "http://localhost:5173";
const VIEW = "<!doctype html><html><head><!--omni-ir-config--></head><body></body></html>";

let server: Awaited<ReturnType<typeof startServer>> | undefined;
const clients: Client[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  await server?.close();
  server = undefined;
});

async function setup(config: Record<string, unknown> = {}) {
  const store = createMemoryStore();
  await seedDemo(store);
  const mailer = createDevMailer();
  server = await startServer({
    model: new MockModel({ speed: "instant" }),
    config: { auth: "magic-link", publicUrl: ORIGIN, mcp: true, rateLimitPerMinute: 100, ...config },
    store,
    mailer,
    mcpView: VIEW,
  });
  const url = server.url;
  /** Sign in as a native app does: the emailed link's token traded for a bearer token. */
  async function tokenFor(email: string): Promise<string> {
    await fetch(`${url}/api/mutate`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ tool: "auth.sendMagicLink", params: { email } }) });
    const token = new URL(mailer.sent.at(-1)!.link).searchParams.get("token");
    const session = await fetch(`${url}/api/auth/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    return ((await session.json()) as { token: string }).token;
  }
  async function connect(bearer?: string) {
    const client = new Client({ name: "test-host", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
      requestInit: bearer ? { headers: { authorization: `Bearer ${bearer}` } } : {},
    });
    await client.connect(transport);
    clients.push(client);
    return client;
  }
  return { store, url, tokenFor, connect };
}

describe("the reference server over MCP", () => {
  it("has no MCP endpoint unless OMNI_MCP is on", async () => {
    const { url } = await setup({ mcp: false });
    expect((await fetch(`${url}/mcp`, { method: "POST" })).status).toBe(404);
    expect(await (await fetch(`${url}/api/health`)).json()).not.toHaveProperty("mcp");
  });

  it("offers show_screen, the view and the app's tools as app-only actions [10.25] [10.28]", async () => {
    const { connect } = await setup();
    const client = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain(SCREEN_TOOL);
    expect(names).toEqual(expect.arrayContaining(["payments.confirm", "orders.requestReturn", "auth.sendMagicLink"]));
    const view = (await client.readResource({ uri: VIEW_URI })).contents[0] as { text: string };
    expect(view.text).toContain('"cabin-pines"');
  });

  it("runs an action as the person whose token the host sends, with their access rules and ownership [B.4]", async () => {
    const { connect, tokenFor, store } = await setup();
    const anonymous = await connect();
    const refused = await anonymous.callTool({ name: "orders.requestReturn", arguments: { orderId: "A1B2-7731" } });
    expect(refused).toMatchObject({ isError: true, structuredContent: { code: "sign_in_required" } });

    const ada = await connect(await tokenFor("ada@example.com"));
    // The demo orders belong to the demo visitor, not Ada: the same answer as an order that doesn't exist.
    const notHers = await ada.callTool({ name: "orders.requestReturn", arguments: { orderId: "A1B2-7731" } });
    expect(notHers).toMatchObject({ isError: true, structuredContent: { code: "not_found" } });
    const ticket = await ada.callTool({ name: "support.createTicket", arguments: { subject: "Late", message: "My parcel is late." } }, undefined);
    expect(ticket.isError).toBeFalsy();
    const audit = await store.audit.list();
    const user = await store.users.byEmail("ada@example.com");
    expect(audit.at(-1)).toMatchObject({ tool: "support.createTicket", outcome: "ok", userId: user!.id });
  });

  it("honours the view's idempotency key: the same press runs once [10.28]", async () => {
    const { connect, tokenFor, store } = await setup();
    const ada = await connect(await tokenFor("ada@example.com"));
    const press = { name: "payments.confirm", arguments: { amount: 12.5, note: "Lunch" }, _meta: { [IDEMPOTENCY_META_KEY]: "press-1" } };
    const first = await ada.callTool(press);
    const again = await ada.callTool(press);
    expect(first.isError).toBeFalsy();
    expect(again.structuredContent).toEqual(first.structuredContent);
    expect((await store.audit.list()).filter((e) => e.tool === "payments.confirm").map((e) => e.outcome)).toEqual(["ok", "replayed"]);
  });

  it("acts as the demo visitor under OMNI_AUTH=demo, as the playground does", async () => {
    const { connect } = await setup({ auth: "demo" });
    const client = await connect();
    const done = await client.callTool({ name: "orders.requestReturn", arguments: { orderId: "A1B2-7731" } });
    expect(done.isError).toBeFalsy();
  });

  it("counts screens shown and actions run, per tool, in the log and /api/health [B.5]", async () => {
    const { connect, url } = await setup({ auth: "demo" });
    const client = await connect();
    await client.callTool({ name: SCREEN_TOOL, arguments: { screen: 'root = Heading("Hi")\nx = Carousel()\n' } });
    await client.callTool({ name: "settings.update", arguments: { language: "English", orderUpdates: true, promotions: false } });
    await client.callTool({ name: "settings.update", arguments: { language: "", orderUpdates: true, promotions: false } });
    const health = (await (await fetch(`${url}/api/health`)).json()) as { mcp: unknown };
    expect(health.mcp).toEqual({ screens: 1, rejectedLines: 1, actions: { "settings.update": { ok: 1, refused: 1 } } });
    expect(server!.logs).toContainEqual(expect.objectContaining({ event: "mcp", type: "screen", components: 1, rejected: 1 }));
    expect(server!.logs).toContainEqual(expect.objectContaining({ event: "mcp", type: "action", tool: "settings.update", outcome: "invalid_params" }));
    // Never the screen's text or an action's params.
    expect(JSON.stringify(server!.logs)).not.toContain("Carousel");
    expect(JSON.stringify(server!.logs)).not.toContain("English");
  });

  it("refuses a browser's cookie: MCP clients send tokens, and a cookie could be sent by any page", async () => {
    const { url, tokenFor } = await setup();
    const token = await tokenFor("ada@example.com");
    const response = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", cookie: `omni_session=${token}`, origin: "https://evil.example" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(response.status).toBe(403);
  });
});
