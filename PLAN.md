# Omni-IR — Phase 1 & 2 Implementation Plan

Scope: tasks 1–5 below. The Express streaming server and the Interactive Playground from the roadmap come after.
Tooling (proposed): npm, TypeScript (strict, ESM), Zod 4, React 19, Vitest + jsdom + Testing Library, tsx.

## Syntax decisions

Status: **FINAL (approved 2026-09-30).** Item 3 follows from CLAUDE.md constraint 1 (flat syntax).

| # | Topic | Proposed default |
|---|-------|------------------|
| 1 | OpenUI relationship | Inspired by OpenUI Lang; the grammar is our own and defined here |
| 2 | Arguments | Positional, then named: `Button("Pay", variant="primary")` |
| 3 | Children / order | **Flat:** one component call per line; children are arrays of references (`card = Card([title, amount])`); forward references are allowed |
| 4 | Root | Explicit `root = …` line |
| 5 | State | `$amount = 42.50` declares; `Text($amount)` binds; only `Input` writes state (see R1) |
| 6 | McpMutation | Its own line: `confirmPay = McpMutation(confirm, tool="payments.confirm", params={amount: $amount})`. Any node with an `action` argument counts as mutating |
| 7 | Literals | Double-quoted strings with `\"`, `\\`, `\n` escapes (no raw newlines, because the format is line-oriented); any other backslash is kept as literal text (R4); numbers, booleans, `null`; object literals only inside `params` |
| 8 | Redefinition / comments | Assigning the same id twice is an error in v1; `#` line comments (outside strings) and blank lines are allowed |
| 9 | v1 catalog | Stack, Card, Heading, Text, **Input**, Button, Divider, Badge, Skeleton |
| 10 | Error policy | Skip the invalid line, emit an error event, keep streaming |

## Runtime streaming mechanics

These are the rules for how the stream behaves at runtime. Tasks 3–5 must follow them, and each one has tests.

### R1. `Input` component (state that can change)
- Syntax: `note = Input($note, label="Note for merchant", placeholder="Optional")`. The first argument must be a state reference; it is what the input edits.
- The input's value comes from the store, and typing calls `store.setState("$note", value)`, which re-renders every node that uses `$note`.
- Typing into an Input is a local change and never needs an McpMutation. Its value reaches the server only when an McpMutation's `params` includes it (e.g. `params={note: $note}`), and only when that mutation fires.
- If the Input arrives before its `$note = …` line, it shows as a Skeleton until the state line arrives (same rule as R5). If the stream ends without the state line, that's an error.
- The schema allows `Input` only with a string-valued state reference, and no `type`, `pattern` or other free-form HTML attributes. Any input variants are fixed by the catalog.

### R2. Line buffering before parsing
- `LineBuffer` receives chunks that may be `string` or `Uint8Array`. Byte chunks are decoded with `TextDecoder('utf-8', {stream: true})`, so a multi-byte character (é, emoji) split across two chunks decodes correctly.
- Text is cut at `\n`; a trailing `\r` is removed, so `\r\n` works too. Only complete lines are passed to the parser, and the incomplete remainder waits in the buffer.
- `end()` flushes the last piece even when it has no `\n` at the end.
- A single line longer than 16 KB is an error: that line is dropped, and parsing resumes after the next `\n`. This stops a bad stream from growing the buffer without limit.

### R3. Stable React keys (no remount flicker)
- The renderer always uses the node's IR id as the React `key`. Ids are unique (syntax #8), so keys stay the same across every update during streaming.
- The schema rejects the same id appearing twice in one children list. It also enforces that each node has only one parent (the AST is a tree, not a graph where one node sits in several places).
- **Structural sharing:** when a line arrives, the store replaces only that node's object; every other node keeps the same object. Each child slot subscribes to the store for its own id only, and each node component is wrapped in `React.memo`, so neither unchanged nodes nor the parent re-render when a child arrives.
- The one allowed remount is a Skeleton being replaced by the real component. The key stays the same; only the component type changes.

### R4. String tokenizer (commas and parentheses inside text)
- A regex is used only for the start of a line: `^\s*(\$?[A-Za-z_]\w*)\s*=\s*`. Everything after the `=` goes through a character-by-character tokenizer. It never splits the text on commas or parentheses.
- Token kinds: identifier, state reference, string, number, `true`/`false`/`null`, and the symbols `( ) [ ] { } , = :`. A small parser built from those tokens then reads the component call.
- Inside a string, `, ( ) [ ] = # $` are ordinary text.
- **Escapes:** `\"`, `\\` and `\n` are decoded. Any other backslash sequence (e.g. `\d`, `\U`) is **kept as literal text**, backslash and character both, and the line still parses; a `warning` event records it, so the model's output can be improved without losing the component. A backslash at the very end of the line followed by the closing quote is treated as an escaped quote, which makes the string unterminated.
- **Known limit:** `C:\new_folder` still decodes `\n` as a line break, because `\n` is a valid escape. Lenient mode can't detect that; it's a prompt/documentation issue.
- An unterminated string is still a line error. There's no safe way to guess where it should have ended.
- Tests must cover: `Text("Hello, world (again)")`, `Text("a = b")`, `Text("She said \"hi\"")`, `Text("# not a comment")`, `Text("$5.00")`, `Text("unterminated)`, a comment at the end of a line containing `#`, `Text("Path: C:\data")` (becomes literal `C:\data` + one warning), and `Text("C:\new")` (becomes a line break, no warning; this documents the known limit).

### R5. Forward references → Skeletons
- A reference to an id that hasn't arrived yet is recorded as pending in the AST. The renderer shows `<Skeleton data-pending-id="…">` in its place, and this Skeleton uses the same key as the real node (R3).
- When the referenced line arrives, the store resolves it. Only the parent and that one slot re-render.
- **Governance while streaming:** a Button with an `action` that isn't wrapped by an McpMutation yet renders disabled. It becomes clickable only once its wrapper line has arrived, so there's never a moment when a user can trigger an ungoverned mutation.
- When `end()` is called, any still-pending reference (node or `$state`) produces a "dangling reference" error, and its Skeleton is **replaced by `<NodeFallback reason="missing">`**, with the same key and a similar size to a Skeleton so the layout doesn't collapse. An Input whose state line never arrived gets the same fallback. An unwrapped mutating Button produces a governance error and stays disabled.
- `NodeFallback` belongs to the renderer, not the catalog: it can't be written in the stream, and the schema rejects it as a component type.

### R6. MCP tool registry (only permitted tools)
- The host app passes a **tool registry** to both the parser and the renderer: `{ "payments.confirm": z.object({ amount: z.number().positive(), note: z.string().max(500) }) , … }`. It's written in the app's code and can never come from the stream.
- **Parse-time check:** an McpMutation line with a `tool` that isn't in the registry is rejected with an `unknown tool` error. Its target Button stays disabled, and the end-of-stream check reports it as ungoverned.
- **Click-time check (second line of defense):** before calling `onMutation`, `<McpMutationBoundary>` checks again that the tool is in the registry, fills in state references, and validates the resulting params with that tool's schema. If either check fails, it does **not** call `onMutation`. Instead it puts the button in an error state (`data-mcp-error`, disabled, message from the catalog) and emits an `error` event. The params check matters because an Input can change a state value to something the tool doesn't accept after parsing.
- The server or MCP host must still authorize every call. The client registry only stops the UI from offering or sending a call it shouldn't.

### R7. Isolating crashes in catalog components
- Each node the renderer creates is wrapped as `<NodeErrorBoundary key={id}>` → `memo(Node)`. The key is on the outer boundary so R3's key stability still holds.
- If a catalog component throws while rendering, only that node shows `<NodeFallback reason="crashed">`. Siblings and parents stay interactive, and an `error` event with the node id is emitted.
- The boundary resets when that node's object **or any state value it reads** changes (e.g. an Input corrects a value the node crashed on). Node objects never change after they arrive (redefinition is an error), so resetting on the node object alone would never happen. Without a reset, a node that crashed once would stay broken after data that fixes it arrives.
- React error boundaries don't catch errors thrown in event handlers, so the catalog's handlers (click, typing) are wrapped in the same `try/catch` + `error` event that a crash uses. That way a failing handler doesn't escape uncaught.

## Task 1: Project setup
- [x] 1.1 Set up the npm project: TS strict + ESM; folders `/engine`, `/catalog`, `/renderer`, `/tests`, `/fixtures`
- [x] 1.2 Dependencies: `zod`, `react@19`, `react-dom@19`; dev: `typescript`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `tsx`
- [x] 1.3 `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `jsx: react-jsx`
- [x] 1.4 Scripts: `typecheck`, `test`, `test:watch`, `demo`
- [x] 1.5 Lint guard: the build fails on `dangerouslySetInnerHTML`, `innerHTML` or `eval`
- **Checkpoint:** `npm run typecheck` and `npm test` pass; the guard catches a planted `innerHTML`

## Task 2: Zod schema (`/engine/schema.ts`)
- [x] 2.1 Value schemas: literals, arrays, node references, state references. **No nested component calls** (flat rule)
- [x] 2.2 Node schema `{ id, type, args, props, children }`; `type` is a fixed list of catalog names (now including `Input`)
- [x] 2.3 Props schema per component, keyed by `type`; no `style`/`className`/`html`; unknown keys rejected. `Input` requires a string state reference as its first argument (R1)
- [x] 2.4 State schema: `$key` = primitive value
- [x] 2.5 McpMutation schema `{ id, target, tool, params }`; `tool` looks like `namespace.action` **and must be a key in the tool registry** (R6); `params` values may be state references. Define a `ToolRegistry` type: tool name → Zod schema for its params
- [x] 2.6 Whole-document check: governance; no duplicate ids; no dangling references; no cycles; **each node has one parent; no duplicate child in one list** (R3)
- [x] 2.7 Export the TypeScript types generated from the schemas as the only shared types
- **Checkpoint:** about 10 valid and about 20 invalid fixtures behave as expected, including an Input bound to a number, a node with two parents, `tool="system.delete_account"` (not in the registry), and `NodeFallback` used as a component type

## Task 3: Streaming parser (`/engine/parser.ts`), test-first
- [x] 3.1 **Write failing tests first**, in three files:
  - `lineBuffer.test.ts` (R2): split mid-line; several lines per chunk; `\r\n`; UTF-8 character split across byte chunks; last line flushed without `\n`; line over 16 KB dropped and parsing resumes
  - `tokenizer.test.ts` (R4): every case listed under R4
  - `parser.test.ts`: single line; forward reference stays pending, then resolves (R5); nested component call rejected as "not flat"; malformed line gives an error and streaming continues; schema-invalid line; state and McpMutation lines; Input with a pending state reference; McpMutation with a tool not in the registry gives an `unknown tool` error (R6); an unknown escape gives a `warning`, not an error, and the node is still added (R4)
- [x] 3.2 Confirm they fail; record the failing run in the commit
- [x] 3.3 `engine/lineBuffer.ts` (R2)
- [x] 3.4 `engine/tokenizer.ts`: regex for the line start + character-by-character tokenizer + small parser for the tokens (R4). Decode `\"` `\\` `\n`; keep other escapes as literal text and return a warning; an unterminated string is an error
- [x] 3.5 Validate each statement with Zod: valid ones go into the AST, invalid ones become error events
- [x] 3.6 AST = map from id to node + root id + pending references; resolve pending references as nodes arrive (R5)
- [x] 3.7 API: `createParser({ tools })` returns `{ write, end, subscribe, getSnapshot }`; plus `parseStream(asyncIterable, { tools })`. Event kinds: `node`, `pending`, `resolved`, `warning`, `error`, `end`
- [x] 3.8 `/engine/store.ts`: store compatible with `useSyncExternalStore`, with **structural sharing** (R3) and `setState` for Input (R1)
- [x] 3.9 When the stream ends, run the whole-document check and mark remaining pending references as **missing** in the snapshot (R5), so the renderer can show fallbacks
- **Checkpoint:** all tests pass; chunk sizes of 1 byte, 7 bytes and the whole file give the same AST; after an unrelated line arrives, every other node's object is still the same object (`===`)

## Task 4: Trusted Catalog (`/catalog`)
- [x] 4.1 v1 components, including `Input` (R1); the catalog owns all styling
- [x] 4.2 `catalog.ts` lookup table, typed so every schema type must have an entry
- [x] 4.3 `<OmniRenderer store tools onMutation onEvent>`: renders recursively from the root; each child is `<NodeErrorBoundary key={id}>` → `memo(Node)` (R3, R7); Skeleton for pending references; **`<NodeFallback reason="missing">` for references marked missing** after `end()` (R5)
- [x] 4.3a `renderer/NodeFallback.tsx` (renderer-owned, not in the catalog): reasons `missing` and `crashed`; similar size to a Skeleton; says "Component failed to load"; `data-fallback-reason` attribute for tests
- [x] 4.3b `renderer/NodeErrorBoundary.tsx`: class-based error boundary (React 19 still requires a class for this); resets when the node's object or the state values it reads change; emits an `error` event with the node id (R7)
- [x] 4.4 `<McpMutationBoundary>`: on click, (1) check the tool is in the registry, (2) fill in state references, (3) validate params with that tool's schema, (4) only then call `onMutation({tool, params})`. If any check fails, the button gets an error state (`data-mcp-error`, disabled) and an `error` event is emitted. Adds `data-mcp-tool`; unwrapped mutating Buttons render disabled (R5, R6)
- [x] 4.5 Input writes to the store only and never reaches `onMutation` (R1). Handlers are wrapped in `try/catch` that report errors (R7)
- **Checkpoint:** component tests pass:
  - clicking a wrapped Button calls `onMutation` exactly once; an unwrapped one is disabled
  - typing into an Input updates a `Text` bound to the same state
  - **mount counter:** in a test-only catalog wrapper, each IR id mounts exactly once while 20 more lines stream in; a Skeleton being replaced by the real component counts as one mount of the real component
  - an Input keeps focus and cursor position while new lines stream in
  - **tool registry:** a boundary built directly with an unregistered tool (skipping the parser) never calls `onMutation` and shows `data-mcp-error`; a registered tool whose params fail its schema at click time (e.g. the user types a 600-character note into an Input that is bound to `$note`, which the tool limits to 500) is also blocked
  - **crash isolation:** a test-only catalog component that throws on render shows `NodeFallback reason="crashed"`, while a sibling Button stays clickable and an `error` event is emitted; the boundary recovers once that node's object changes to data that doesn't crash
  - **missing fallback:** after `end()` with a dangling child, the slot shows `NodeFallback reason="missing"` and the parent's other children keep their positions

## Task 5: Payment confirmation end-to-end
- [ ] 5.1 `fixtures/payment-confirmation.omni`: `root` comes first (so Skeletons are needed). A Card with heading, merchant, amount, date, a **note Input** bound to `$note`, divider, Confirm (McpMutation `payments.confirm`, `params={amount: $amount, note: $note}`) and a local Cancel. At least one text argument contains `,` and `()`
- [ ] 5.2 `tests/mockStream.ts`: async generator sending **random-sized byte chunks** (cut in the middle of lines and in the middle of multi-byte characters) with delays
- [ ] 5.3 `tests/e2e.payment.test.tsx`:
  - midway: Skeletons are showing for pending ids, and Confirm is disabled if its McpMutation line hasn't arrived
  - at the end: no Skeletons remain; amount and merchant are shown; Confirm has `data-mcp-tool`
  - type into the note, click Confirm, and `onMutation` receives `{tool: "payments.confirm", params: {amount: 42.5, note: "<typed text>"}}`; Cancel never calls it
  - the mount counter shows no remounts; there are no errors
- [ ] 5.4 Invalid variants, each its own fixture:
  - McpMutation line removed → governance error; Confirm stays disabled
  - `tool="system.delete_account"` → `unknown tool` error; Confirm stays disabled; `onMutation` never called
  - a child that never arrives → dangling-reference error; `NodeFallback reason="missing"` in its place; the rest of the Card works
  - the merchant `Text` has `Path: C:\data` → one `warning`, node still rendered with the literal backslash
- [ ] 5.5 `npm run demo`: prints parser events (`node`, `pending`, `resolved`, `warning`, `error`, `end`) and the final `renderToString` HTML
- **Checkpoint:** `npm test` all green; the demo shows the Skeleton-to-real sequence and the MCP-wrapped Confirm button
