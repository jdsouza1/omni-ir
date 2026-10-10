// The browser clients with updates (SPEC.md [10.35]-[10.39]), end to end against the in-browser API
// (the same rules as the server, tests/server.live.test.ts): generate() learns the screen's id,
// followScreen() applies its updates and follows again after a drop, and an action's result updates
// the screen its Button was on.
import { createParser } from "@omni-ir/core";
import { createMutationHandler, followScreen, generate } from "@omni-ir/react";
import { ASSETS } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { TOOLS } from "../app/tools";
import { createInBrowserApi } from "../server/inBrowser";
import { FixtureModel } from "../server/models/fixtureModel";
import { readFileSync } from "node:fs";

function setup() {
  const queue: (() => void)[] = [];
  const api = createInBrowserApi({
    model: new FixtureModel({ speed: "instant", read: (id) => readFileSync(`fixtures/${id}.omni`, "utf8") }),
    schedule: (fn) => {
      queue.push(fn);
      return () => {};
    },
  });
  const parser = createParser({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES });
  /** Run the feed's next step, letting the client read it. */
  const step = async () => {
    queue.shift()?.();
    await new Promise((r) => setTimeout(r, 10));
  };
  return { api, parser, step };
}

const status = (parser: ReturnType<typeof createParser>) => {
  const node = parser.getSnapshot().nodes.get("order_status");
  return node?.type === "Badge" ? node.props.text : undefined;
};

describe("following a screen [10.36]-[10.38]", () => {
  it("generate() reports the screen's id; followScreen() applies each update, in order, until end", async () => {
    const { api, parser, step } = setup();
    const outcome = await generate("where is my order?", { parser, fetch: api });
    expect(outcome).toMatchObject({ status: "done", screen: expect.stringMatching(/^scr_/) });
    expect(status(parser)).toBe("Shipped");

    const seen: number[] = [];
    const following = followScreen((outcome as { screen: string }).screen, { parser, fetch: api, onUpdate: (r, seq) => r.applied && seen.push(seq) });
    await step();
    expect(status(parser)).toBe("Out for delivery");
    await step();
    expect(status(parser)).toBe("Delivered");
    expect(await following).toEqual({ status: "ended" });
    expect(seen).toEqual([1, 2]);
  });

  it("follows again after a dropped connection, from the last update it received [10.39]", async () => {
    const { api, parser, step } = setup();
    const outcome = await generate("where is my order?", { parser, fetch: api });
    const asked: string[] = [];
    let drops = 1;
    // The first connection drops right after its first update. No onUpdate: updates apply without one.
    const flaky: typeof fetch = async (input, init) => {
      const url = String(input);
      asked.push(new URL(url, "http://x").searchParams.get("after")!);
      const response = await api(input, init);
      if (!url.includes("/api/live") || drops-- <= 0) return response;
      // Answer with the first update, then fail, as a dropped connection does.
      const first = await response.body!.getReader().read();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(first.value!);
        },
        pull(controller) {
          controller.error(new Error("connection dropped"));
        },
      });
      return new Response(body, { status: 200, headers: response.headers });
    };
    const following = followScreen((outcome as { screen: string }).screen, { parser, fetch: flaky, retryMs: 5 });
    await step();
    await new Promise((r) => setTimeout(r, 100)); // the drop, and following again after it
    expect(status(parser)).toBe("Out for delivery");
    expect(asked).toEqual(["0", "1"]);
    await step();
    expect(await following).toEqual({ status: "ended" });
    expect(status(parser)).toBe("Delivered");
    expect(asked).toEqual(["0", "1"]);
  });

  it("stops when the app stops it, and on a screen the server doesn't know", async () => {
    const { api, parser } = setup();
    await generate("where is my order?", { parser, fetch: api });
    const controller = new AbortController();
    const following = followScreen("scr_unknown", { parser, fetch: api });
    expect(await following).toMatchObject({ status: "error", code: "not_found" });
    const outcome = await generate("where is my order?", { parser: createParser({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES }), fetch: api });
    const stopped = followScreen((outcome as { screen: string }).screen, { parser, fetch: api, signal: controller.signal });
    controller.abort();
    expect(await stopped).toEqual({ status: "aborted" });
  });
});

describe("an action's result [10.35]", () => {
  it("updates the screen where its Button was, when the app asks for updates", async () => {
    const { api, parser } = setup();
    await generate("where is my order?", { parser, fetch: api });
    const sent: unknown[] = [];
    const recording: typeof fetch = async (input, init) => {
      if (String(input).includes("/api/mutate")) sent.push(JSON.parse(String(init?.body)));
      return api(input, init);
    };
    const handler = createMutationHandler({ fetch: recording, onUpdate: (text) => parser.update(text) });
    await handler({ id: "requestReturn", target: "returnItem", tool: "orders.requestReturn", params: { orderId: "A1B2-7731" } });
    expect(sent).toEqual([{ tool: "orders.requestReturn", params: { orderId: "A1B2-7731" }, button: "returnItem" }]);
    const node = parser.getSnapshot().nodes.get("returnItem");
    expect(node?.type).toBe("Notice");
    expect(parser.getSnapshot().mutations.has("returnItem")).toBe(false);
  });

  it("doesn't send the Button's id when the app doesn't apply updates", async () => {
    const { api } = setup();
    const sent: unknown[] = [];
    const handler = createMutationHandler({
      fetch: async (input, init) => {
        sent.push(JSON.parse(String(init?.body)));
        return api(input, init);
      },
    });
    await handler({ id: "requestReturn", target: "returnItem", tool: "orders.requestReturn", params: { orderId: "A1B2-7731" } });
    expect(sent).toEqual([{ tool: "orders.requestReturn", params: { orderId: "A1B2-7731" } }]);
  });
});
