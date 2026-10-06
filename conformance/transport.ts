// Transport conformance cases (SPEC.md section 10): what a client must do with a server's answer to
// a request for a screen. Written by hand from the spec, never copied from an implementation's output.
// `npm run conformance:build` writes them to conformance/transport/sse.json.

export interface TransportCase {
  id: string;
  /** SPEC.md rule ids this case checks. */
  rules: string[];
  description: string;
  /** The server's answer: HTTP status and body (UTF-8 text; a list of parts is joined in order). */
  response: { status: number; body: string | string[] };
  expect: {
    /** Everything the client wrote to the parser, joined in order. */
    written: string;
    /** Whether the client ended the parser. */
    ended: boolean;
    /** How the call ended. Only the fields given are compared; messages never are. */
    outcome:
      | { status: "done"; stopReason?: string; model?: string; ms?: number }
      | { status: "error"; code: string; retryable: boolean };
  };
}

/** One server-sent event as the reference server writes it ([10.4]). */
const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const chunk = (text: string) => ev("chunk", { text });
const done = ev("done", { stopReason: "end_turn", model: "mock", ms: 12 });
const DONE = { status: "done", stopReason: "end_turn", model: "mock", ms: 12 } as const;
const LOST = { status: "error", code: "connection_lost", retryable: true } as const;

export const TRANSPORT_CASES: TransportCase[] = [
  {
    id: "sse-basic",
    rules: ["10.4", "10.5", "10.7"],
    description: "Each chunk's text is written in order, even when a piece ends inside a line; done gives the outcome.",
    response: { status: 200, body: [chunk("root = Card([ti"), chunk('tle])\ntitle = Heading("Hi")\n'), done] },
    expect: { written: 'root = Card([title])\ntitle = Heading("Hi")\n', ended: true, outcome: DONE },
  },
  {
    id: "sse-empty-screen",
    rules: ["10.5", "10.9"],
    description: "A stream with no chunks and a done event: nothing written, the parser still ended.",
    response: { status: 200, body: [done] },
    expect: { written: "", ended: true, outcome: DONE },
  },
  {
    id: "sse-crlf",
    rules: ["10.6"],
    description: "\\r\\n line endings in the event framing count as \\n.",
    response: { status: 200, body: [chunk("a = Divider()\n").replaceAll("\n", "\r\n"), done.replaceAll("\n", "\r\n")] },
    expect: { written: "a = Divider()\n", ended: true, outcome: DONE },
  },
  {
    id: "sse-comments-and-pings",
    rules: ["10.6", "10.10"],
    description: "Comment lines, such as the keep-alive ping, are skipped wherever they appear.",
    response: { status: 200, body: [": ping\n\n", chunk("a = Divider()\n"), ": ping\n\n", ": another comment\n", done] },
    expect: { written: "a = Divider()\n", ended: true, outcome: DONE },
  },
  {
    id: "sse-multi-line-data",
    rules: ["10.6"],
    description: "Several data lines are joined with \\n before the JSON is read.",
    response: { status: 200, body: ['event: chunk\ndata: {"text":\ndata: "a = Divider()\\n"}\n\n', done] },
    expect: { written: "a = Divider()\n", ended: true, outcome: DONE },
  },
  {
    id: "sse-other-fields",
    rules: ["10.6", "10.11"],
    description: "id: and retry: fields, and fields without a space after the colon, are handled as Server-Sent Events say.",
    response: { status: 200, body: ['id: 7\nretry: 1000\nevent:chunk\ndata:{"text":"a = Divider()\\n"}\n\n', done] },
    expect: { written: "a = Divider()\n", ended: true, outcome: DONE },
  },
  {
    id: "sse-utf8",
    rules: ["10.6", "3.3"],
    description: "Multi-byte characters arrive intact however the bytes are split (the runner splits every case).",
    response: { status: 200, body: [chunk('a = Text("Café ☕ 日本 🎉")\n'), done] },
    expect: { written: 'a = Text("Café ☕ 日本 🎉")\n', ended: true, outcome: DONE },
  },
  {
    id: "sse-unknown-event",
    rules: ["10.7"],
    description: "An event the client doesn't know is skipped.",
    response: { status: 200, body: [ev("progress", { percent: 50 }), chunk("a = Divider()\n"), ev("message", { text: "not a chunk" }), done] },
    expect: { written: "a = Divider()\n", ended: true, outcome: DONE },
  },
  {
    id: "sse-bad-data",
    rules: ["10.7"],
    description: "Data that isn't a JSON object, and a chunk whose text isn't a string, are skipped.",
    response: {
      status: 200,
      body: ["event: chunk\ndata: not json\n\n", "event: chunk\ndata: [1, 2]\n\n", ev("chunk", { text: 42 }), ev("chunk", {}), chunk("a = Divider()\n"), done],
    },
    expect: { written: "a = Divider()\n", ended: true, outcome: DONE },
  },
  {
    id: "sse-event-without-data",
    rules: ["10.6"],
    description: "An event with a name but no data is ignored, including a done without data.",
    response: { status: 200, body: ["event: chunk\n\n", "event: done\n\n", chunk("a = Divider()\n"), done] },
    expect: { written: "a = Divider()\n", ended: true, outcome: DONE },
  },
  {
    id: "sse-done-missing-fields",
    rules: ["10.7"],
    description: "A done event with missing fields still ends the stream as done.",
    response: { status: 200, body: [chunk("a = Divider()\n"), ev("done", {})] },
    expect: { written: "a = Divider()\n", ended: true, outcome: { status: "done" } },
  },
  {
    id: "sse-error-after-chunks",
    rules: ["10.5", "10.9"],
    description: "An error after some chunks: what arrived stays written, the parser is ended, the error is reported.",
    response: { status: 200, body: [chunk("root = Stack([a, b])\na = Divider()\n"), ev("error", { code: "model_error", message: "Generation failed.", retryable: true })] },
    expect: { written: "root = Stack([a, b])\na = Divider()\n", ended: true, outcome: { status: "error", code: "model_error", retryable: true } },
  },
  {
    id: "sse-error-unknown-code",
    rules: ["10.5"],
    description: "Any error code is accepted as given, with its retryable flag.",
    response: { status: 200, body: [ev("error", { code: "quota_exhausted_for_tenant", message: "No.", retryable: false })] },
    expect: { written: "", ended: true, outcome: { status: "error", code: "quota_exhausted_for_tenant", retryable: false } },
  },
  {
    id: "sse-error-missing-fields",
    rules: ["10.7"],
    description: "An error event with missing fields is server_error, not retryable.",
    response: { status: 200, body: [ev("error", {})] },
    expect: { written: "", ended: true, outcome: { status: "error", code: "server_error", retryable: false } },
  },
  {
    id: "sse-after-terminal",
    rules: ["10.8"],
    description: "Everything after the first terminal event is ignored: later chunks, a second done, an error.",
    response: {
      status: 200,
      body: [chunk("a = Divider()\n"), done, chunk("b = Divider()\n"), ev("error", { code: "model_error", message: "x", retryable: true }), ev("done", { stopReason: "max_tokens", model: "other", ms: 1 })],
    },
    expect: { written: "a = Divider()\n", ended: true, outcome: DONE },
  },
  {
    id: "sse-no-terminal",
    rules: ["10.9"],
    description: "The response ends without a terminal event: connection_lost, retryable, and the parser is ended.",
    response: { status: 200, body: [chunk("root = Stack([a])\n")] },
    expect: { written: "root = Stack([a])\n", ended: true, outcome: LOST },
  },
  {
    id: "sse-unfinished-event",
    rules: ["10.6", "10.9"],
    description: "An event without its closing blank line when the response ends is not an event.",
    response: { status: 200, body: [chunk("a = Divider()\n"), 'event: done\ndata: {"stopReason":"end_turn","model":"mock","ms":1}\n'] },
    expect: { written: "a = Divider()\n", ended: true, outcome: LOST },
  },
  {
    id: "http-error-body",
    rules: ["10.2", "10.3"],
    description: "An error status with the error body: reported as given, nothing written, the parser not touched.",
    response: { status: 429, body: JSON.stringify({ error: { code: "rate_limited", message: "Too many requests.", retryable: true } }) },
    expect: { written: "", ended: false, outcome: { status: "error", code: "rate_limited", retryable: true } },
  },
  {
    id: "http-error-unsupported-version",
    rules: ["10.2", "10.3", "10.12"],
    description: "unsupported_version before the stream starts.",
    response: { status: 400, body: JSON.stringify({ error: { code: "unsupported_version", message: "This server writes Omni-IR 0.5.", retryable: false } }) },
    expect: { written: "", ended: false, outcome: { status: "error", code: "unsupported_version", retryable: false } },
  },
  {
    id: "http-error-not-json-5xx",
    rules: ["10.3"],
    description: "An error status with a body that isn't the error form: server_error, retryable for 500 and above.",
    response: { status: 502, body: "<html>Bad gateway</html>" },
    expect: { written: "", ended: false, outcome: { status: "error", code: "server_error", retryable: true } },
  },
  {
    id: "http-error-not-json-4xx",
    rules: ["10.3"],
    description: "An error status below 500 with a body that isn't the error form: server_error, not retryable.",
    response: { status: 404, body: "Not found" },
    expect: { written: "", ended: false, outcome: { status: "error", code: "server_error", retryable: false } },
  },
];

/** The JSON files, by name. */
export function renderTransportFiles(): Record<string, string> {
  return { "sse.json": JSON.stringify({ area: "transport", cases: TRANSPORT_CASES }, null, 2) + "\n" };
}
