// Omni-IR over AG-UI 1.0 (SPEC.md [10.18]-[10.20], PLAN-TRANSPORT.md E): the encoder's events are
// checked against AG-UI's own schemas (@ag-ui/core, a dev dependency only), a screen sent through the
// encoder and the reader parses exactly as when sent directly, and the reader accepts only added lines.
import { EventSchema, RunAgentInputSchema } from "@ag-ui/core/schemas";
import { createParser, versionMarker } from "@omni-ir/core";
import { AgUiEncoder, createAgUiReader, OMNI_ACTIVITY_TYPE, type AgUiEvent } from "@omni-ir/core/ag-ui";
import { TOOLS } from "../app/tools";
import { ASSETS } from "../app/assets";
import { fixtureTexts } from "../fuzz/arbitraries";
import { MockModel } from "../server/models/mock";
import { canonical, parseCanonical } from "./canonical";
import { FakeModel, startServer } from "./serverHelpers";

const registry = { tools: Object.keys(TOOLS), assets: Object.keys(ASSETS) };
const ids = { threadId: "thread-1", runId: "run-1", messageId: "screen-1" };

/** Everything an encoder sends for these pieces of text, ending the run normally. */
function encode(pieces: string[], version = "0.5"): AgUiEvent[] {
  const encoder = new AgUiEncoder({ ...ids, version });
  return [...encoder.start(), ...pieces.flatMap((p) => encoder.write(p)), ...encoder.finish()];
}

/** Feed events to a reader over a real parser; returns the parser's canonical result and the reader. */
function read(events: AgUiEvent[]) {
  const parser = createParser({ tools: TOOLS, assets: ASSETS });
  const issues: { line: number | null; code: string }[] = [];
  parser.subscribe((e) => (e.type === "error" || e.type === "warning") && issues.push({ line: e.issue.line ?? null, code: e.issue.code }));
  const reader = createAgUiReader(parser);
  const results = events.map((e) => reader.feed(e));
  return { parser, reader, results, issues, result: () => canonical(parser.getSnapshot(), issues) };
}

const delta = (value: unknown, op = "add", path = "/lines/-") => ({ type: "ACTIVITY_DELTA", messageId: "screen-1", activityType: OMNI_ACTIVITY_TYPE, patch: [{ op, path, value }] });
const snapshot = (lines: unknown[], version = "0.5") => ({ type: "ACTIVITY_SNAPSHOT", messageId: "screen-1", activityType: OMNI_ACTIVITY_TYPE, content: { version, lines } });

describe("the encoder [10.18]", () => {
  it("sends RUN_STARTED, one snapshot, one delta per complete line, the last line, then RUN_FINISHED", () => {
    const events = encode(["root = Ca", "rd([t])\r\nt = Te", 'xt("x")']);
    expect(events.map((e) => e.type)).toEqual(["RUN_STARTED", "ACTIVITY_SNAPSHOT", "ACTIVITY_DELTA", "ACTIVITY_DELTA", "RUN_FINISHED"]);
    expect(events[1]).toMatchObject({ messageId: "screen-1", activityType: "omni-ir", content: { version: "0.5", lines: [] } });
    expect(events.slice(2, 4).map((e) => e.patch)).toEqual([
      [{ op: "add", path: "/lines/-", value: "root = Card([t])" }],
      [{ op: "add", path: "/lines/-", value: 't = Text("x")' }],
    ]);
    expect(events[0]).toMatchObject({ threadId: "thread-1", runId: "run-1" });
    expect(events[4]).toMatchObject({ threadId: "thread-1", runId: "run-1" });
  });

  it("ends with RUN_ERROR when the stream fails, after the lines that arrived", () => {
    const encoder = new AgUiEncoder({ ...ids, version: "0.5" });
    const events = [...encoder.start(), ...encoder.write("root = Divider()\npartial"), ...encoder.fail("The model failed.", "model_error")];
    expect(events.map((e) => e.type)).toEqual(["RUN_STARTED", "ACTIVITY_SNAPSHOT", "ACTIVITY_DELTA", "ACTIVITY_DELTA", "RUN_ERROR"]);
    expect(events.at(-1)).toEqual({ type: "RUN_ERROR", message: "The model failed.", code: "model_error" });
  });

  it("every event it sends is valid by AG-UI 1.0's own schemas", () => {
    const encoder = new AgUiEncoder({ ...ids, version: "0.5" });
    const events = [...encode(fixtureTexts().slice(0, 5)), ...encoder.start(), ...encoder.fail("x", "model_error")];
    for (const event of events) expect(EventSchema.safeParse(event).success, JSON.stringify(event)).toBe(true);
  });
});

describe("the reader [10.19]", () => {
  it("parses every fixture exactly as the same text sent directly, with the version marker as line 1", () => {
    for (const text of fixtureTexts()) {
      const { result } = read(encode([text]));
      expect(result()).toEqual(parseCanonical([`${versionMarker("0.5.0")}\n${text}`], registry));
    }
  });

  it("writes a marker from content.version, so a newer screen asks for an update", () => {
    const { issues, parser } = read([snapshot([], "99.0"), delta("root = Divider()"), { type: "RUN_FINISHED", threadId: "t", runId: "r" }]);
    expect(issues).toEqual([{ line: 1, code: "newer_version" }]);
    expect(parser.getSnapshot().newerVersion).toBe(true);
    expect(read([snapshot([], "five"), delta("root = Divider()")]).issues).toEqual([]);
  });

  it.each([
    ["replacing a line", delta("root = Text(\"evil\")", "replace", "/lines/0")],
    ["removing a line", { ...delta(null, "remove", "/lines/0"), patch: [{ op: "remove", path: "/lines/0" }] }],
    ["moving a line", { ...delta(null), patch: [{ op: "move", from: "/lines/1", path: "/lines/0" }] }],
    ["adding at a position", delta("x = Divider()", "add", "/lines/0")],
    ["adding elsewhere", delta("x = Divider()", "add", "/version")],
    ["a value that isn't a string", delta(42)],
    ["one bad operation among good ones", { ...delta(null), patch: [{ op: "add", path: "/lines/-", value: "b = Divider()" }, { op: "replace", path: "/lines/0", value: "x" }] }],
    ["a snapshot that rewrites the lines", snapshot(['root = Text("evil")'])],
  ])("refuses %s, and changes nothing", (_, bad) => {
    const { parser, results } = read([snapshot([]), delta("root = Stack([a])"), bad, delta("a = Divider()")]);
    expect(results[2]).toMatchObject({ error: expect.any(String) });
    const doc = parser.getSnapshot();
    expect([...doc.nodes.keys()].sort()).toEqual(["a", "root"]);
    expect(doc.nodes.get("root")).toMatchObject({ type: "Stack" });
  });

  it("accepts a later snapshot that only adds lines, as middleware that merges deltas sends", () => {
    const { parser, results } = read([snapshot([]), delta("root = Stack([a, b])"), snapshot(["root = Stack([a, b])", "a = Divider()", "b = Divider()"])]);
    expect(results.every((r) => r.error === undefined)).toBe(true);
    expect([...parser.getSnapshot().nodes.keys()].sort()).toEqual(["a", "b", "root"]);
  });

  it("ignores other activity types, other messages, deltas before the snapshot, and a replace: false snapshot", () => {
    const { parser } = read([
      delta("early = Divider()"),
      { type: "ACTIVITY_SNAPSHOT", messageId: "plan", activityType: "PLAN", content: { steps: [] } },
      snapshot(["root = Stack([a])"]),
      { ...snapshot(["root = Text(\"other\")"]), messageId: "screen-2" },
      { ...snapshot(["root = Text(\"x\")"]), replace: false },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: "a = Divider()" },
      delta("a = Divider()"),
    ]);
    expect([...parser.getSnapshot().nodes.keys()].sort()).toEqual(["a", "root"]);
  });

  it("ends the parser when the run ends, however it ends, and ignores everything after", () => {
    for (const end of [{ type: "RUN_FINISHED", threadId: "t", runId: "r" }, { type: "RUN_ERROR", message: "failed", code: "model_error" }]) {
      const { parser, reader } = read([snapshot(["root = Stack([a])"]), end, delta("a = Divider()")]);
      expect(parser.getSnapshot().complete, end.type).toBe(true);
      expect(parser.getSnapshot().missing, end.type).toEqual(new Set(["a"]));
      expect(reader.outcome, end.type).toEqual(end.type === "RUN_FINISHED" ? { status: "done" } : { status: "error", message: "failed", code: "model_error" });
    }
  });
});

describe("POST /api/ag-ui [10.18] [10.20]", () => {
  let server: Awaited<ReturnType<typeof startServer>> | null = null;
  afterEach(async () => {
    await server?.close();
    server = null;
  });

  const input = (text: string) => ({ threadId: "thread-1", runId: "run-1", messages: [{ id: "m1", role: "user", content: text }] });
  const post = (body: unknown, query = "") =>
    fetch(`${server!.url}/api/ag-ui${query}`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify(body) });

  /** AG-UI's HTTP+SSE binding: one JSON event per data field; other fields and comments are ignored. */
  async function events(response: Response): Promise<AgUiEvent[]> {
    const raw = await response.text();
    expect(raw.includes("\r")).toBe(false);
    return raw
      .split("\n\n")
      .flatMap((block) => block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()))
      .filter(Boolean)
      .map((data) => JSON.parse(data) as AgUiEvent);
  }

  it("takes AG-UI's run input and streams a screen the reader parses exactly as /api/generate's", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant", seed: 4 }) });
    expect(RunAgentInputSchema.safeParse(input("a payment confirmation")).success).toBe(true);
    const response = await post(input("a payment confirmation"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const received = await events(response);
    for (const event of received) expect(EventSchema.safeParse(event).success, JSON.stringify(event)).toBe(true);
    expect(received[0]).toMatchObject({ type: "RUN_STARTED", threadId: "thread-1", runId: "run-1" });
    expect(received.at(-1)).toMatchObject({ type: "RUN_FINISHED", threadId: "thread-1", runId: "run-1" });

    const viaAgUi = read(received);
    const sse = await fetch(`${server.url}/api/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "a payment confirmation" }) });
    const direct = parseCanonical([(await sse.text()).split("\n").filter((l) => l.startsWith("data: ")).map((l) => (JSON.parse(l.slice(6)) as { text?: string }).text ?? "").join("")], registry);
    expect(viaAgUi.result()).toEqual(direct);
  });

  it("carries the screen only: no tool calls, so governed actions still go through /api/mutate", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant", seed: 4 }) });
    const received = await events(await post(input("a payment confirmation")));
    expect(new Set(received.map((e) => e.type))).toEqual(new Set(["RUN_STARTED", "ACTIVITY_SNAPSHOT", "ACTIVITY_DELTA", "RUN_FINISHED"]));
  });

  it("uses the last user message as the prompt, and refuses input without one", async () => {
    const model = new FakeModel(async ({ onText }) => {
      onText("root = Divider()\n");
      return { stopReason: "end_turn", model: "fake" };
    });
    server = await startServer({ model });
    const conversation = { ...input("first"), messages: [{ id: "a", role: "user", content: "first" }, { id: "b", role: "assistant", content: "ok" }, { id: "c", role: "user", content: "second" }] };
    await (await post(conversation)).text();
    expect(model.prompts).toEqual(["second"]);
    for (const bad of [{}, { threadId: "t", runId: "r", messages: [] }, { threadId: "t", runId: "r", messages: [{ id: "a", role: "assistant", content: "hi" }] }]) {
      const response = await post(bad);
      expect(response.status, JSON.stringify(bad)).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
    }
  });

  it("reports a failed model as RUN_ERROR, and refuses an older format before streaming", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }) });
    const failed = await events(await post(input("demo: model error")));
    expect(failed.at(-1)).toMatchObject({ type: "RUN_ERROR", code: "model_error" });
    const refused = await post(input("hi"), "?version=0.4"); // an older format than the server writes
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ error: { code: "unsupported_version" } });
  });
});
