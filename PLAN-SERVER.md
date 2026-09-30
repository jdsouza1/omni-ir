# Omni-IR — Step 1: Express SSE Server (mock model by default)

Goal: a browser asks for a screen → the server streams Omni-IR over SSE → the existing parser, store and renderer show it as it arrives. **Nothing in this step costs money by default:** the server uses a mock model that streams pre-written screens with realistic timing. A real Claude adapter is included but stays off unless you explicitly turn it on.

Status: **APPROVED 2026-09-30.** License: Apache-2.0.

Decided 2026-09-30:
- **Syntax:** the flat grammar already built (PLAN.md) is the one true Omni-IR syntax. The landing page's indented `screen / show / ask / action` examples are not Omni-IR and will be rewritten.
- **Components:** no new catalog components in this step.
- **Cost:** mock data for anything that would cost money. No paid API calls in tests, demos or checks. The Claude adapter is opt-in only.

## Architecture

```
Browser                               Server                                  Model (pluggable)
───────                               ──────                                  ─────────────────
prompt ──POST /api/generate──────────► validate body (Zod) ──────────────────► MockModel (default, free)
parser.write(text) ◄──SSE "chunk"──── forward text only  ◄──────────────────── or ClaudeModel (opt-in)
parser.end()       ◄──SSE "done"───── stop reason, timing
                   ◄──SSE "error"──── model error / timeout
tab closed / Cancel ─────────────────► abort the model stream

Button click → McpMutationBoundary → POST /api/mutate ─► server re-validates tool + params ─► stub handler
```

The server **forwards raw text and never trusts it**. Validation stays in the client's parser and schema, the trusted zone. The server also runs a parser over the same text, but only to log errors; it never changes what's forwarded.

## Design decisions

### S1. Pluggable model, mock by default
- `server/models/types.ts`: one small interface, `generate(prompt, signal)` → async iterable of text chunks + a final result `{ stopReason, usage? }`. The server only knows this interface.
- **`MockModel` (default):** picks a pre-written screen from `fixtures/` by keywords in the prompt, then streams it in random-sized chunks with token-like delays (reusing `mockStream`). Things it has to handle:
  - Screens: payment confirmation (exists), plus new ones built only from current components: login form, profile settings, order status, support contact.
  - A prompt that matches nothing gets a "demo mode" screen listing the example prompts, so the playground always shows something.
  - Special prompts replay the failure variants (`demo: unknown tool`, `demo: missing child`, `demo: cut off`, `demo: model error`), so every error path can be seen without a real model.
  - It honours the abort signal, and a `speed` setting (instant for tests, realistic for the demo).
- **`ClaudeModel` (opt-in, off by default):** `client.beta.messages.stream` with `claude-opus-5-5` at effort `low`, the cached system prompt, the refusal fallback beta, and only `text_delta` forwarded. It's used **only** when `OMNI_MODEL=claude` **and** a credential is present. Otherwise the server logs "using mock model" at startup. It's typechecked and unit-tested with a stubbed SDK client, so no network calls; it's never run automatically.

### S2. System prompt generated from the schema (used by `ClaudeModel` and the free check)
- `server/prompt.ts` builds the prompt from `COMPONENTS`, the grammar rules and the tool registry, so it can't disagree with the parser. It covers:
  - output contract: only Omni-IR lines
  - grammar and flat syntax; `root` first
  - the component reference, generated from the schema
  - the governance rule, and Inputs bound to string state
  - escaping ("write `\\` for every backslash")
  - permitted tools as JSON Schema (`z.toJSONSchema`)
  - 2–3 example screens taken from `fixtures/`
- Deterministic (no dates, ids or unsorted keys) so that, if Claude is ever turned on, it's cached.
- Tests: every example in the prompt parses with zero issues; every component and enum is mentioned; two builds are byte-identical.

### S3. SSE protocol (`POST /api/generate`)
- Request body `{ prompt: string }`, validated with Zod (1–2000 characters). POST keeps prompts out of URLs.
- `text/event-stream`, each `data:` payload JSON-encoded:
  - `chunk { text }`
  - `done { stopReason, model: "mock" | "claude", ms }`
  - `error { code, message, retryable }` with safe messages only
- A heartbeat comment every 15 seconds; `Cache-Control: no-cache`, `X-Accel-Buffering: no`.

### S4. Stop reasons, errors and abort
| Situation | Server | Client |
|---|---|---|
| Normal end | `done` | `parser.end()` |
| Cut off (`max_tokens`, or mock `demo: cut off`) | `done { stopReason: "max_tokens" }` | `parser.end()`: missing parts become fallbacks; show "response was cut short" |
| Model error mid-stream (mock `demo: model error`) | `error`, then close | `parser.end()`, keep what arrived + message |
| Bad request | HTTP 400 JSON | show message |
| Browser disconnects / Cancel | abort the model stream | `AbortController.abort()` |
| Too slow | timeout (default 120 s) → abort + `error { code: "timeout" }` | as model error |

### S5. `/api/mutate` with stub handlers
- The client's `onMutation` posts `{ tool, params }`. The server **re-validates** against its own copy of the registry: unknown tool → 403, bad params → 422.
- Handlers are stubs (`payments.confirm` returns a fake receipt id). Real authorization is marked as a TODO for a real backend.
- The registry moves from `tests/helpers.ts` to `app/tools.ts`, shared by server, client, tests and demo.

### S6. Server hygiene
- Config from env via Zod: port, model (`mock` default), timeout, CORS origin, rate limit, daily cap.
- CORS restricted to the dev origin. Per-IP rate limit (10/min).
- **Daily generation cap** applies to `ClaudeModel` only (default 50/day), so turning Claude on can never run up an unexpected bill.
- Logs record sizes, timings, stop reason and the observer's error codes, never prompt text.

### S7. Parse observer
The server feeds the same text into a server-side parser and logs error and warning codes per request, without changing the forwarded stream.

### S8. Free prompt check (replaces the paid eval)
- `npm run prompt:print` prints the system prompt.
- `npm run validate -- file.omni` reports parse errors, warnings and end-of-stream issues, then prints the rendered HTML.
- Workflow: paste the prompt into a Claude.ai chat, ask for a few screens, save the replies to files, validate them. This is manual, and costs nothing beyond your existing plan.

## Task checklist

### Task A: Setup and shared registry
- [x] A.1 Add `express@5`, `@anthropic-ai/sdk`, `@types/express` (npm scripts are added in the task that creates each script)
- [x] A.2 Move `TOOLS` to `app/tools.ts`; update tests and demo; `tests/` keeps only test code
- [x] A.3 `server/config.ts` (env via Zod; `OMNI_MODEL` defaults to `mock`)
- **Checkpoint:** 161 existing tests pass; typecheck clean; demo no longer imports from `tests/`

### Task B: Fixtures and `MockModel`, test-first
- [x] B.1 New fixtures using only the current catalog: login form, profile settings, order status, support contact, demo-mode screen. A test checks every fixture parses with zero issues.
- [x] B.2 Failing tests: keyword routing; unmatched prompt → demo-mode screen; `demo:` prompts replay each variant; abort stops the stream within 100 ms; instant speed for tests
- [x] B.3 Implement `server/models/types.ts` + `MockModel`
- **Checkpoint:** tests pass; every fixture renders with no errors

### Task C: `/api/generate`, test-first
- [ ] C.1 Failing tests (real HTTP on `app.listen(0)` + `fetch`, with `MockModel` at instant speed):
  - chunks with `\n`, `"` and multi-byte characters arrive exactly
  - `done`; cut off; model error mid-stream; timeout
  - disconnect aborts the model
  - body validation (400); rate limit (429); heartbeat
- [ ] C.2 Implement `server/app.ts` + `server/index.ts`
- **Checkpoint:** all server tests pass offline

### Task D: `/api/mutate`, test-first
- [ ] D.1 Failing tests: valid → 200 + receipt; unknown tool → 403; 600-character note → 422; `__proto__` key → 422
- [ ] D.2 Implement with the shared registry and stub handlers
- **Checkpoint:** tests pass; posting directly with curl is still re-validated

### Task E: Browser client helper
- [ ] E.1 `client/generate.ts`: POST + streaming SSE reader → `parser.write()`; `done`/`error` → `parser.end()`
- [ ] E.2 `client/mutate.ts`: default `onMutation` → `/api/mutate`; 403/422 → renderer error events
- [ ] E.3 End-to-end tests (browser helper → Express → `MockModel` → parser → renderer): a streamed screen renders; Cancel aborts both sides; cut-off shows fallbacks; Pay → `/api/mutate` → receipt
- **Checkpoint:** end-to-end tests pass offline

### Task F: Prompt, Claude adapter (off), tools
- [ ] F.1 `server/prompt.ts` + its tests (S2)
- [ ] F.2 `ClaudeModel` + unit tests with a stubbed SDK client: forwards text only; maps stop reasons and typed SDK errors; aborts; daily cap blocks after N. **No network calls.**
- [ ] F.3 `npm run prompt:print` and `npm run validate`
- [ ] F.4 Server-side parse observer + request log
- [ ] F.5 `npm run demo` gains a `--server` mode that streams from the running mock server
- [ ] F.6 Update `CLAUDE.md`: how to run the server, mock vs Claude, where the prompt lives
- **Checkpoint:** full suite passes offline; `npm run server` + `demo --server` shows a streamed screen with no API key set

## Not in this step
- Running `ClaudeModel` against the real API (costs money; your choice, any time, by setting `OMNI_MODEL=claude` and a key)
- New catalog components (Image, Rating, DateRange, List, chat)
- The Interactive Playground page (next step, built on this server)
- Rewriting the landing page examples

## Resolved
- **License:** Apache-2.0 (LICENSE added, package.json updated).
