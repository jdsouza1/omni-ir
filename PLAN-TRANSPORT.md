# Omni-IR — Step 14: transport standard and stream versions

Goal: today only the text format is standard. How a screen travels from a server to an app, how errors and dropped connections are reported, and which version a stream needs are described only by the reference server, "informative" in SPEC.md §10. Anyone building a second server or client has to copy our code instead of a spec. This step makes the transport a standard with its own conformance cases, maps it onto WebSockets and onto AG-UI (the event protocol many agent frameworks speak), and lets a stream say which version it needs.

Status: **APPROVED 2026-10-06** with the recommendations, after a review of each decision's pros, cons and trade-offs (below), which changed two things: WebSockets are specified but not built, and two safety rules were added (an "update the app" notice, and AG-UI updates may only add lines). All work is free: mock model only, no paid API, nothing published without a separate go-ahead.

## Research: AG-UI today (2026-10-06)

- **AG-UI 1.0 is out**, with normative rules ("MUST/SHOULD"), SCREAMING_CASE event names, and an in-band version: the client sends `protocolVersion` in its request (`RunAgentInput`), the agent answers with its own on `RUN_STARTED`. The reference types are on npm as `@ag-ui/core` 1.0.2 (MIT, no dependencies, no install scripts).
- **Transport:** one `POST` with the run input as JSON; the answer is Server-Sent Events, each event's `data` exactly one JSON event with a `type` field. Consumers ignore the SSE `event:` and `id:` fields and tolerate comment lines. Errors before the stream starts are an HTTP status; after it starts, a `RUN_ERROR` event. **No resumption:** `Last-Event-ID` is not used, and a connection that drops before a terminal event is a "truncated run". There is also a binary (protobuf) binding.
- **Activity events** are AG-UI's slot for structured UI that only the frontend renders: `ACTIVITY_SNAPSHOT` (`messageId`, `activityType`, `content` object) creates or replaces one, `ACTIVITY_DELTA` amends it with a JSON Patch (RFC 6902). "A consumer MUST tolerate types it does not recognise." Activity messages are never sent back to the agent.
- **Generative UI** in AG-UI is still a draft (a `generateUserInterface` tool plus a pluggable generator); AG-UI says it carries A2UI, Open-JSON-UI and MCP-UI, but specifies no event shape for them. So there is no official Omni-IR slot to fill: we define one, using activity events, which any AG-UI 1.0 client already passes through.

Sources: [AG-UI events](https://docs.ag-ui.com/concepts/events), [activity events 1.0](https://docs.ag-ui.com/spec/1.0/events/activity.md), [HTTP+SSE binding 1.0](https://docs.ag-ui.com/spec/1.0/basic/transports/http-sse.md), [run input 1.0](https://docs.ag-ui.com/spec/1.0/basic/run-input.md), [1.0 changelog](https://docs.ag-ui.com/spec/1.0/changelog.md), [generative UI draft](https://docs.ag-ui.com/drafts/generative-ui.md).

## Proposal

**1. A normative transport (SPEC.md §10, numbered rules).** What the reference server and the three clients (web, iOS, Android) already do, written down so another implementation can match it:

- **Request:** `POST` with `{"prompt": "…"}` and optionally `{"version": "0.5"}` (the version the client renders; see 3). `Accept: text/event-stream`.
- **Errors before the stream:** an HTTP status with the JSON error body `{"error": {"code", "message", "retryable"}}`, and a fixed list of codes (`invalid_request`, `rate_limited`, `unsupported_version`, `server_error`, …).
- **The stream:** `chunk` (`{"text"}`), then exactly one terminal event, `done` (`stopReason`, `model`, `ms`) or `error` (`code`, `message`, `retryable`), then the server closes. A comment line (`: ping`) at least every 15 seconds while nothing else is sent. LF line endings; one JSON object per `data`.
- **Clients:** feed each `chunk`'s text to the parser exactly as received; skip events and fields they don't know; always end the parser when the stream stops, however it stops, so anything missing becomes a fallback instead of loading forever, as all three clients do today. A connection that closes without a terminal event is `connection_lost` (retryable). A client SHOULD treat 45 seconds with no bytes at all, pings included, as `connection_lost`.
- **No resumption**, like AG-UI 1.0: retrying means a new request and a new screen. (Question 3.)
- **Actions:** `POST /api/mutate`, the answers it gives today (200, 400, 403, 422, 429, 500) and the rule that the server checks again, as normative text.

**2. Transport conformance cases.** A new language-neutral file, `conformance/cases/transport.json`: raw response bytes (status, headers, body) in, expected out: the exact text the parser receives and the outcome (`done`, `error` with its code, `connection_lost`). Covers CRLF framing, events split across reads, multi-line `data`, unknown events, comment lines, a missing terminal event, an error after chunks, malformed JSON in an event, a UTF-8 character split across reads, and errors before the stream. Run, like the parser cases, at several chunk sizes by the TypeScript `generate()`, the Swift `OmniClient` decoder and the Kotlin `OmniClient` decoder. Written from the spec, tests first.

**3. Stream versions.** The server (never the model) writes the stream's first line as a comment: `# omni-ir 0.5`.

- **Older parsers already skip it**, because a line starting with `#` is a comment ([3.6]). Nothing breaks.
- **A parser that knows the marker** compares it with its own version. If the stream needs a newer version, it reports one warning, `newer_version` (line 1), and carries on: anything it doesn't know is still rejected line by line as today, but the app can now say "update the app to show this screen" instead of showing scattered fallbacks. Renderers SHOULD show such a notice. (Question 2.)
- **A client can say what it renders** (`"version"` in the request), and a server that can't write for that version answers `unsupported_version` before streaming, instead of sending lines the client will reject. The reference server writes only its own version, so it refuses any other minor version (all of 0.x may be incompatible, [12]).
- Over AG-UI, the version goes in the activity content (see 5). Spec rules, conformance cases and all three parsers, tests first.

**4. WebSockets: specified, not built.** The same events as JSON messages with a `type` field: the client sends `{"type": "generate", "prompt": "…", "version": "0.5"}`; the server answers `{"type": "chunk", "text": "…"}` … then `done` or `error`, then closes with code 1000. One generation per connection. A short mapping in §10, including the security rule that a server MUST check the `Origin` header itself (browsers don't apply CORS to WebSockets). No reference endpoint until someone asks: it would add attack surface and a dependency for little gain, since the stream flows one way, which is what Server-Sent Events are for. (Question 4.)

**5. AG-UI.** An Omni-IR screen travels as one activity message:

```
RUN_STARTED      {threadId, runId}
ACTIVITY_SNAPSHOT {messageId: "screen-1", activityType: "omni-ir", content: {version: "0.5", lines: []}}
ACTIVITY_DELTA   {messageId: "screen-1", activityType: "omni-ir", patch: [{op: "add", path: "/lines/-", value: "root = Card([title])"}]}
ACTIVITY_DELTA   … one patch per complete line …
RUN_FINISHED     (or RUN_ERROR {message, code})
```

- **Why lines, not text:** JSON Patch can't append to a string, so sending text pieces would mean resending the whole screen each time. Omni-IR acts only on complete lines anyway, so one `add` per line costs nothing in speed and keeps each delta tiny. An AG-UI client that doesn't know `omni-ir` skips it, as AG-UI requires.
- **In `@omni-ir/core`, under a new entry point `@omni-ir/core/ag-ui`** (no new dependency): `toAgUiEvents()` turns an Omni-IR text stream into these events (for agent backends written in TypeScript), and `feedAgUiEvent(event, parser)` feeds a parser from AG-UI events (for apps that already use an AG-UI client). The parser is the same; everything is still checked line by line.
- **Reference endpoint** `POST /api/ag-ui` in the Express server: takes an AG-UI `RunAgentInput`, uses the last user message as the prompt, streams the events above over AG-UI's SSE binding, mock model by default.
- **Proof of compatibility:** every event we produce is checked against `@ag-ui/core`'s own schemas (dev dependency only, MIT, no dependencies), and a test runs a stream end to end through the endpoint into `feedAgUiEvent` and compares the screen with the plain SSE result.
- **Only adding lines is accepted.** `feedAgUiEvent` accepts a delta only if every operation is `add` at `/lines/-` with a string; anything else (replacing, removing or moving a line, or a second snapshot that rewrites the screen) is an error and changes nothing, because Omni-IR never lets a line be rewritten ([5.3]). A test covers each case.
- **Governed actions do not go through the agent.** A Button's McpMutation still calls the app's own `/api/mutate`, checked again there; AG-UI carries the screen, never the authority to act. Stated in the spec.

**6. Rate limits behind a proxy** *(added 2026-10-06 from the review of earlier steps)*. The reference server counts requests per IP address but isn't told to trust a proxy, so behind a load balancer every user shares the proxy's address and one busy user blocks everyone. A new setting, `OMNI_TRUST_PROXY` (off by default; a hop count or a list of proxy addresses, passed to Express's `trust proxy`), makes the server read the client's address from `X-Forwarded-For` only when it comes from a trusted proxy. §10 says how a server reports a limit (429, `rate_limited`, `Retry-After`). Per-user limits wait for sign-in (roadmap item 2); the limiter stays in memory, which the docs state with its consequence (each server instance counts on its own).

**7. Docs.** SPEC.md §10 rewritten as rules; a "Transport" page and a "Use with AG-UI" guide on the docs site; the landing page and README mention AG-UI support; CHANGELOG.

**Not in this step:** a shared rate limiter across server instances (needs a store such as Redis; with real handlers); AG-UI on iOS and Android (the Swift and Kotlin clients get the SSE transport cases and the version marker; native AG-UI support waits until someone asks); AG-UI's protobuf binding; resuming a dropped stream; anything that reaches the agent from the screen.

## Facts that shape this

- The three clients already behave the same way (they were ported from `generate.ts`), so most of 1 is writing down and testing, not changing behaviour. One likely difference to settle: what each does with an event whose JSON is malformed.
- The version marker reuses the comment syntax on purpose: a new statement kind would make every older parser report `syntax` on line 1.
- `0.5` is the next version; releasing it is a separate go-ahead (E.3).
- Mock model only. The hosted playground keeps working: its in-browser API (`server/inBrowser.ts`) gets the same version rules.

## Decisions: pros, cons and trade-offs

**1. Version marker: the comment `# omni-ir 0.5` on line 1, written by the server.**
- *Pros:* every app already on 0.4 keeps working, because it skips `#` lines; one short line per screen, no measurable cost; only line 1 counts and the marker can only cause a warning, so a model writing its own marker unlocks nothing.
- *Cons:* a comment with a meaning is easy to overlook in the spec; 0.4 apps get no benefit; servers that don't write it get today's behaviour.
- *Trade-off:* a statement such as `@version 0.5` is clearer, but every 0.4 parser would report `syntax` on line 1 of every 0.5 screen.

**2. A newer stream: one `newer_version` warning, then parse as usual.**
- *Pros:* users see everything that can be shown, as with any bad line ([3.8]); no security change, since unknown lines are still rejected one by one; the app chooses what to show.
- *Cons:* a partial screen can mislead (a form missing a field). Mitigated: a Button whose McpMutation wasn't understood stays disabled, and renderers SHOULD show an "update the app" notice.
- *Trade-off:* stopping is safer for high-stakes screens but throws away what works; an app that wants that can still choose it.

**3. Reconnecting: no resumption, as in AG-UI 1.0.**
- *Pros:* servers keep nothing per stream, so any instance answers any request; no resume tokens to steal or replay and no buffers for an attacker to fill; same behaviour as AG-UI; event ids can be added later without breaking anything.
- *Cons:* a drop mid-screen on a weak network means asking again, which with a paid model costs the tokens and the wait again. Mitigated: the partial screen stays with fallbacks, `connection_lost` is retryable, and apps can offer Retry.
- *Trade-off:* resuming helps only long screens on bad networks, and costs server memory, a per-stream authorization check and resume code in three clients.

**4. WebSockets: the mapping in the spec only** *(changed from "spec and reference endpoint" after weighing it)*.
- *Pros:* other implementers get a defined shape; no new attack surface (WebSocket endpoints bypass CORS and need their own origin checks, rate and size limits) and no new dependency.
- *Cons:* the mapping isn't proven by running code; apps that want WebSockets build their own endpoint.
- *Trade-off:* the stream flows one way, which Server-Sent Events already do well, and AG-UI doesn't use WebSockets; build the endpoint when someone asks.

**5. AG-UI: activity events, one line per patch.**
- *Pros:* AG-UI clients that don't know `omni-ir` skip it as required, so nobody sees raw Omni-IR text; activity content is never sent back to the agent; AG-UI middleware that compacts deltas into snapshots still yields valid lines; no visible delay, since the parser acts on complete lines anyway.
- *Cons:* about 100 bytes of wrapping per line (about 3 KB on a 30-line screen); it is our convention, so other AG-UI apps need our helper to draw it, and a future AG-UI standard for generative UI may need a second mapping; a hostile agent could send patches that rewrite earlier lines, so only appends are accepted (above).
- *Trade-off:* plain text messages would show raw Omni-IR in chat for every client that doesn't know it; custom events are dropped silently by clients that don't know them.

**6. AG-UI helpers in `@omni-ir/core/ag-ui`.**
- *Pros:* nothing new to install; always the same version as the parser; apps that don't import it don't load it; no runtime dependency (our own types, `@ag-ui/core` in tests only).
- *Cons:* the core package grows by a few KB; a breaking AG-UI change forces a core release; web only for now.
- *Trade-off:* a separate `@omni-ir/ag-ui` package keeps core's releases independent but is one more package to publish and keep in step; it can still be split out later.

**7. Rate limits behind a proxy: an opt-in `OMNI_TRUST_PROXY` setting.**
- *Pros:* limits work per user behind a load balancer; off by default, so a server not behind a proxy can't be fooled by a forged `X-Forwarded-For`; no new dependency.
- *Cons:* set wrongly (trusting every hop on a server reachable directly), anyone can forge their address and dodge the limit, so the docs must say exactly when to set it; still one count per server instance.
- *Trade-off:* a shared limiter (Redis) counts across instances but adds a service to run; it belongs with real handlers and sign-in.

## Task checklist

Work on branch `wip/transport`. Each part starts with failing tests (constraint 4).

**A. Research** *(done)*
- [x] A.1 AG-UI 1.0: events, activity, HTTP+SSE binding, run input, versioning (above)

**B. Transport standard** *(tests first)*
- [ ] B.1 SPEC.md §10 as numbered rules: request, error body and codes, events, terminal event, pings, client rules, no resumption, `/api/mutate`
- [ ] B.2 `conformance/cases/transport.json` from `conformance/build.ts`, with a coverage test like the parser rules'
- [ ] B.3 Run the transport cases in TypeScript (`generate()`), Swift and Kotlin (`OmniClient` decoders); fix any difference by the spec
- [ ] B.4 The idle timeout (45 s without bytes) in all three clients

**C. Stream versions** *(tests first)*
- [ ] C.1 Spec rules for the marker, `newer_version` and the renderer's "update the app" notice, and `version` / `unsupported_version` in the request; conformance cases
- [ ] C.2 The three parsers read the marker; regenerate the schema files and the fuzz corpus
- [ ] C.3 The server and the in-browser API write the marker and check the requested version; the three clients send their version

**D. WebSockets** *(spec only, question 4)*
- [ ] D.1 The mapping in §10, with the origin check rule; no endpoint

**E. AG-UI** *(tests first)*
- [ ] E.1 The mapping in §10 (activity type `omni-ir`, content `{version, lines}`, one line per patch, actions never through the agent)
- [ ] E.2 `@omni-ir/core/ag-ui`: `toAgUiEvents()` and `feedAgUiEvent()`; events checked against `@ag-ui/core` (dev dependency); only appends accepted, with a test per rejected patch
- [ ] E.3 `POST /api/ag-ui` in the Express server; an end-to-end test comparing the screen with the SSE result
- [ ] E.4 Package checks: the new entry point in the build, pack check and install test

**F. Rate limits behind a proxy** *(tests first)*
- [ ] F.1 `OMNI_TRUST_PROXY` in the server config, off by default; tests for no proxy, a trusted proxy and a forged header
- [ ] F.2 §10's rate-limit rule; the deployment docs say when to set it

**G. Docs and review** *(checkpoint: you review)*
- [ ] G.1 Docs site: a "Transport" page and a "Use with AG-UI" guide; README, landing page and CHANGELOG
- [ ] G.2 A review page: the transport rules, the case results on all three platforms, an AG-UI run
- [ ] G.3 Merge with your approval
- [ ] G.4 `v0.5.0` release: a separate go-ahead from you
