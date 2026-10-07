// Step 18 (PLAN-MCPAPPS.md, B): the MCP server of the bridge, through the official MCP client over an
// in-memory transport. No network, no paid API.
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createOmniMcpServer, IDEMPOTENCY_META_KEY, SCREEN_TOOL, VIEW_URI, type ActionCall, type OmniMcpEvent, type OmniMcpOptions } from "@omni-ir/mcp";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";

const VIEW = "<!doctype html><html><head><!--omni-ir-config--></head><body><div id=root></div></body></html>";
const GOOD = 'root = Card([title, pay])\ntitle = Heading("Pay")\npay = Button("Pay", action="go")\ngo = McpMutation(pay, tool="payments.confirm", params={amount: 5, note: ""})\n';

let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function connect(options: Partial<OmniMcpOptions> = {}) {
  const calls: ActionCall[] = [];
  const events: OmniMcpEvent[] = [];
  const server = createOmniMcpServer({
    tools: TOOLS,
    assets: ASSETS,
    viewHtml: VIEW,
    onAction: async (call) => {
      calls.push(call);
      return call.tool === "orders.requestReturn" ? { ok: false, code: "not_found", message: "No such order." } : { ok: true, result: { done: true } };
    },
    onEvent: (e) => events.push(e),
    ...options,
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test-host", version: "1.0.0" });
  await client.connect(b);
  return { client, calls, events };
}

describe("the bridge's MCP server", () => {
  it("offers show_screen to the model, linked to the view, with the format guide as its description [10.25]", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const screen = tools.find((t) => t.name === SCREEN_TOOL)!;
    expect(screen._meta).toMatchObject({ ui: { resourceUri: VIEW_URI } });
    expect((screen._meta as { ui: { visibility?: string[] } }).ui.visibility ?? ["model", "app"]).toContain("model");
    expect(screen.inputSchema).toMatchObject({ type: "object", properties: { screen: { type: "string" } }, required: ["screen"] });
    expect(screen.description).toContain("McpMutation(");
    expect(screen.description).toContain("payments.confirm");
  });

  it("offers every registered tool as an action only the view can call [10.28]", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    for (const name of Object.keys(TOOLS)) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool!._meta).toMatchObject({ ui: { resourceUri: VIEW_URI, visibility: ["app"] } });
    }
  });

  it("serves the view as an MCP App resource, with the app's tools and pictures inside and no network [10.25]", async () => {
    const { client } = await connect();
    const { contents } = await client.readResource({ uri: VIEW_URI });
    const view = contents[0] as { mimeType: string; text: string; _meta?: { ui?: { csp?: unknown } } };
    expect(view.mimeType).toBe("text/html;profile=mcp-app");
    expect(view._meta?.ui?.csp).toBeUndefined(); // the hosts' strict default: no network at all
    const config = JSON.parse(view.text.match(/<script type="application\/json" id="omni-ir-config">([\s\S]*?)<\/script>/)![1]!.replace(/\\u003c/g, "<"));
    expect(Object.keys(config.tools).sort()).toEqual(Object.keys(TOOLS).sort());
    expect(config.tools["payments.confirm"]).toMatchObject({ type: "object", properties: { amount: { type: "number" } } });
    expect(config.assets["cabin-pines"].src).toMatch(/^data:image\/svg\+xml,/);
  });

  it("escapes the injected configuration so it can't close its script", async () => {
    const { client } = await connect({ assets: { evil: { src: "data:image/svg+xml,</script><script>alert(1)</script>", width: 1, height: 1 } } });
    const { contents } = await client.readResource({ uri: VIEW_URI });
    const text = (contents[0] as { text: string }).text;
    expect(text.match(/<\/script>/g)).toHaveLength(1);
    expect(text).not.toContain("<script>alert");
  });

  it("tells the model what was shown, and which lines were rejected and why, so it can correct them [10.27]", async () => {
    const { client, events } = await connect();
    const ok = await client.callTool({ name: SCREEN_TOOL, arguments: { screen: GOOD } });
    expect(ok.isError).toBeFalsy();
    expect(ok.structuredContent).toMatchObject({ components: 3, rejected: [] });
    const text = (ok.content as { type: string; text: string }[])[0]!.text;
    expect(text).toMatch(/shown/i);

    const bad = await client.callTool({ name: SCREEN_TOOL, arguments: { screen: GOOD + 'x = Carousel(["a"])\ny = Image("https://e.com/a.png", alt="A")\n' } });
    expect(bad.isError).toBeFalsy(); // the valid part is still shown
    expect(bad.structuredContent).toMatchObject({
      rejected: [expect.objectContaining({ line: 5, code: "unknown_component" }), expect.objectContaining({ line: 6, code: "invalid_props" })],
    });
    expect((bad.content as { text: string }[])[0]!.text).toMatch(/line 5.*unknown_component/s);
    expect(events.filter((e) => e.type === "screen")).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: "screen", components: 3, rejected: 2 });
  });

  it("runs an action only after checking it against the tool's schema, with the view's idempotency key [10.28]", async () => {
    const { client, calls, events } = await connect();
    const done = await client.callTool({ name: "payments.confirm", arguments: { amount: 5, note: "hi" }, _meta: { [IDEMPOTENCY_META_KEY]: "key-1" } });
    expect(done.isError).toBeFalsy();
    expect(done.structuredContent).toEqual({ done: true });
    expect(calls).toEqual([{ tool: "payments.confirm", params: { amount: 5, note: "hi" }, idempotencyKey: "key-1", user: null }]);

    const invalid = await client.callTool({ name: "payments.confirm", arguments: { amount: -1, note: "" } });
    expect(invalid.isError).toBe(true);
    expect(calls).toHaveLength(1); // never reached the app
    // A refinement the JSON schema can't express is still checked on the server.
    const backwards = await client.callTool({ name: "bookings.reserve", arguments: { checkIn: "2026-11-16", checkOut: "2026-11-14" } });
    expect(backwards.isError).toBe(true);
    expect(calls).toHaveLength(1);

    const refused = await client.callTool({ name: "orders.requestReturn", arguments: { orderId: "B7-2210" } });
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent).toEqual({ code: "not_found", message: "No such order." });
    expect(events.filter((e) => e.type === "action").map((e) => e.type === "action" && e.outcome)).toEqual(["ok", "invalid_params", "invalid_params", "not_found"]);
  });

  it("passes who is calling to the app's actions [B.4]", async () => {
    const { client, calls } = await connect({ user: { id: "u1", email: "a@example.com" } });
    await client.callTool({ name: "assistant.ask", arguments: { question: "Hi?" } });
    expect(calls[0]!.user).toEqual({ id: "u1", email: "a@example.com" });
  });

  it("without onAction, offers screens only: no action tools, and the guide says there are no actions", async () => {
    const { client } = await connect({ onAction: undefined, tools: {} });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([SCREEN_TOOL]);
    expect(tools[0]!.description).toMatch(/no actions/i);
  });
});
