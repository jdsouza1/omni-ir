// The reference server's live screens (Step 22, SPEC.md [10.35]-[10.40]): the `live` event, the feed at
// /api/live, resuming, catching up, and updates in action results. Feeds run on a hand-driven clock.
import { z } from "zod";
import { createParser } from "@omni-ir/core";
import { MockModel } from "../server/models/mock";
import { createLiveScreens } from "../server/live";
import { readFileSync } from "node:fs";
import { ACTION_UPDATES, LIVE_FEEDS, ORDER_FEED, SALES_FEED, salesChart, type LiveFeed } from "../app/live";
import { ASSETS } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { TOOLS } from "../app/tools";
import { readSse, startServer, textOf } from "./serverHelpers";

/** A scheduler the test runs by hand: `tick()` runs every step that is due. */
function manualClock() {
  const queue: { fn: () => void; cancelled: boolean }[] = [];
  return {
    schedule: (fn: () => void) => {
      const task = { fn, cancelled: false };
      queue.push(task);
      return () => void (task.cancelled = true);
    },
    tick() {
      for (const task of queue.splice(0)) if (!task.cancelled) task.fn();
    },
    get pending() {
      return queue.filter((t) => !t.cancelled).length;
    },
  };
}

let server: Awaited<ReturnType<typeof startServer>> | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(clock = manualClock()) {
  server = await startServer({ model: new MockModel({ speed: "instant" }), schedule: clock.schedule });
  return clock;
}

async function screenFor(prompt: string) {
  const { events } = await readSse(await server!.generate({ prompt }));
  return { events, screen: (events.find((e) => e.event === "live")?.data as { screen: string } | undefined)?.screen };
}

const follow = (screen: string, after = 0, init: RequestInit = {}) => fetch(`${server!.url}/api/live?screen=${encodeURIComponent(screen)}&after=${after}`, init);

describe("the live event [10.36]", () => {
  it("comes before the terminal event, with an unguessable id, for a screen the app keeps current", async () => {
    await start();
    const { events, screen } = await screenFor("where is my order?");
    expect(textOf(events)).toContain("order_status = Badge(");
    const names = events.map((e) => e.event);
    expect(names.indexOf("live")).toBeGreaterThan(names.lastIndexOf("chunk"));
    expect(names.indexOf("live")).toBeLessThan(names.indexOf("done"));
    expect(screen).toMatch(/^scr_[0-9a-f]{32}$/);
  });

  it("isn't sent for a screen nothing keeps current", async () => {
    await start();
    const { events, screen } = await screenFor("a payment confirmation");
    expect(screen).toBeUndefined();
    expect(events.at(-1)?.event).toBe("done");
  });
});

describe("GET /api/live [10.37]-[10.39]", () => {
  it("sends each update, numbered from 1, then end, and closes", async () => {
    const clock = await start();
    const { screen } = await screenFor("where is my order?");
    const response = await follow(screen!);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    clock.tick();
    clock.tick();
    const { events } = await readSse(response);
    expect(events).toEqual([
      { event: "update", data: { seq: 1, text: 'order_status = Badge("Out for delivery")\n' } },
      { event: "update", data: { seq: 2, text: 'order_status = Badge("Delivered", tone="success")\n' } },
      { event: "end", data: {} },
    ]);
  });

  it("resumes after the last update a client received, and ends at once for an ended screen", async () => {
    const clock = await start();
    const { screen } = await screenFor("where is my order?");
    clock.tick();
    clock.tick();
    const { events } = await readSse(await follow(screen!, 1));
    expect(events.map((e) => [e.event, (e.data as { seq?: number }).seq])).toEqual([
      ["update", 2],
      ["end", undefined],
    ]);
  });

  it("refuses an unknown screen, another person's, and a bad request with the same shapes as [10.2]", async () => {
    await start();
    expect((await follow("scr_nope")).status).toBe(404);
    expect(await (await follow("scr_nope")).json()).toMatchObject({ error: { code: "not_found" } });
    const { screen } = await screenFor("where is my order?");
    expect((await fetch(`${server!.url}/api/live?screen=${screen}&after=-1`)).status).toBe(400);
    expect((await fetch(`${server!.url}/api/live?after=0`)).status).toBe(400);
  });

  it("sends pings while it has nothing to say [10.10]", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }), schedule: manualClock().schedule, heartbeatMs: 20 });
    const { screen } = await screenFor("where is my order?");
    const controller = new AbortController();
    const response = await follow(screen!, 0, { signal: controller.signal });
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain(": ping");
    controller.abort();
  });
});

describe("live screens [10.38]-[10.40]", () => {
  const parserFor = (text: string) => {
    const parser = createParser({ tools: { "orders.requestReturn": z.any() } });
    parser.write(text);
    parser.end();
    return parser;
  };
  const sink = () => {
    const got: [number, string][] = [];
    let ended = false;
    return { got, ended: () => ended, sink: { update: (seq: number, text: string) => void got.push([seq, text]), end: () => void (ended = true) } };
  };

  it("never send an update that doesn't apply to the server's copy, and log it", () => {
    const clock = manualClock();
    const logs: Record<string, unknown>[] = [];
    const broken: LiveFeed = { part: "order_status", follows: () => true, steps: () => [{ delayMs: 1, text: "order_status = Nope()\n" }, { delayMs: 1, text: 'order_status = Badge("Fine")\n' }] };
    const live = createLiveScreens({ feeds: [broken], schedule: clock.schedule, log: (e) => logs.push(e) });
    const id = live.open(parserFor('root = Stack([order_status])\norder_status = Badge("Shipped")\n'), null)!;
    const s = sink();
    live.follow(id, null, 0, s.sink);
    clock.tick();
    clock.tick();
    expect(s.got).toEqual([[1, 'order_status = Badge("Fine")\n']]);
    expect(logs).toContainEqual({ event: "live", outcome: "update_rejected", issues: ["unknown_component"] });
  });

  it("catch a client up with one update, numbered as the latest, when the missed ones are gone", () => {
    const clock = manualClock();
    const live = createLiveScreens({ feeds: [SALES_FEED], schedule: clock.schedule, keep: 1 });
    const parser = parserFor(`root = Stack([sales_today, note])\n$note = ""\nnote = Input($note, label="Note")\n${salesChart(3)}`);
    const id = live.open(parser, null)!;
    clock.tick();
    clock.tick();
    clock.tick();
    const s = sink();
    live.follow(id, null, 0, s.sink);
    expect(s.got).toEqual([[3, salesChart(6)]]);
    // Applied to the screen as the client had it, it brings it to the server's version.
    const client = parserFor(`root = Stack([sales_today, note])\n$note = ""\nnote = Input($note, label="Note")\n${salesChart(3)}`);
    expect(client.update(s.got[0]![1]).applied).toBe(true);
    expect(client.getSnapshot().nodes.get("sales_today")).toEqual(parser.getSnapshot().nodes.get("sales_today"));
  });

  it("belong to the person they were served to", () => {
    const live = createLiveScreens({ feeds: [ORDER_FEED], schedule: manualClock().schedule });
    const id = live.open(parserFor('root = Stack([order_status])\norder_status = Badge("Shipped")\n'), "user_1")!;
    expect(live.follow(id, "user_2", 0, sink().sink)).toBeNull();
    expect(live.follow(id, null, 0, sink().sink)).toBeNull();
    expect(live.follow(id, "user_1", 0, sink().sink)).not.toBeNull();
  });

  it("are dropped when nobody has followed them for an hour, and their feeds stop", () => {
    const clock = manualClock();
    let now = 0;
    const live = createLiveScreens({ feeds: [ORDER_FEED], schedule: clock.schedule, now: () => now });
    live.open(parserFor('root = Stack([order_status])\norder_status = Badge("Shipped")\n'), null);
    expect(live.size).toBe(1);
    now = 60 * 60 * 1000 + 1;
    live.open(parserFor("root = Divider()\n"), null);
    expect(live.size).toBe(0);
    expect(clock.pending).toBe(0);
  });
});

describe("the demo app's updates", () => {
  const fixture = (name: string) => {
    const parser = createParser({ tools: TOOLS, assets: ASSETS, components: APP_COMPONENTS, pictures: PICTURES });
    parser.write(readFileSync(`fixtures/${name}.omni`, "utf8"));
    parser.end();
    return parser;
  };

  it.each([
    ["order-status", ORDER_FEED],
    ["sales-dashboard", SALES_FEED],
  ] as const)("every step of the feed for %s applies to it", (name, feed) => {
    const parser = fixture(name);
    expect(LIVE_FEEDS.filter((f) => f.follows(parser.getSnapshot()))).toEqual([feed]);
    const steps = feed.steps(parser.getSnapshot());
    expect(steps.length).toBeGreaterThan(1);
    for (const step of steps) expect(parser.update(step.text), step.text).toEqual({ applied: true, issues: [] });
  });

  it.each([
    ["order-status", "orders.requestReturn", "returnItem"],
    ["product", "cart.add", "add"],
  ])("the result of %s's %s applies where its Button was", (name, tool, button) => {
    const parser = fixture(name);
    expect(parser.getSnapshot().mutations.get(button)?.tool).toBe(tool);
    expect(parser.update(ACTION_UPDATES[tool]!({}, button))).toEqual({ applied: true, issues: [] });
    expect(parser.getSnapshot().mutations.has(button)).toBe(false);
  });
});

describe("updates in action results [10.35]", () => {
  const mutate = (body: unknown) =>
    fetch(`${server!.url}/api/mutate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("carry the app's update for the pressed Button", async () => {
    await start();
    const body = await (await mutate({ tool: "orders.requestReturn", params: { orderId: "A1B2-7731" }, button: "returnItem" })).json();
    expect(body).toMatchObject({ ok: true, update: `returnItem = Notice("Return requested. We'll email you a label.", tone="success")\n` });
  });

  it("are left out without a Button, for a Button id that isn't one, and for tools without one", async () => {
    await start();
    expect(await (await mutate({ tool: "orders.requestReturn", params: { orderId: "A1B2-7731" } })).json()).not.toHaveProperty("update");
    for (const button of ["x = Text(\"injected\")\nroot", "__proto__", "9bad"]) {
      const body = await (await mutate({ tool: "orders.requestReturn", params: { orderId: "A1B2-7731" }, button })).json();
      expect(body, button).not.toHaveProperty("update");
    }
    const paid = await (await mutate({ tool: "payments.confirm", params: { amount: 5, note: "" }, button: "pay" })).json();
    expect(paid).not.toHaveProperty("update");
  });
});
