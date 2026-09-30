# Omni-IR: Generative UI Protocol

## WHAT
We are building an open-source standard for Generative UI called Omni-IR. It consists of a line-oriented streaming parser, a strict Zod-based schema validator, a client-side reactive state store, and a Native React renderer (The Trusted Catalog).

## WHY
To provide a secure, ultra-fast, cross-platform standard where an LLM generates declarative Intent Bytecode instead of raw, human-readable code. The AI must never dictate styling, CSS, or raw HTML.

## HOW (Tech Stack)
- **Language:** Pure TypeScript.
- **Validation:** Zod.
- **Frontend Engine:** React 19 (for the Trusted Catalog).
- **Backend/CLI Server:** Node.js / Express (for streaming the LLM response).

## STRICT CONSTRAINTS (Never Break These)
1. **No Code Generation:** The AI agent simulating the Omni-IR stream must ONLY output flat, line-oriented assignment syntax (e.g., `btn = Button("Submit")`). It must never output HTML, Tailwind, or React code.
2. **Strict Native Catalog:** The React renderer must use a predefined dictionary of components. Do not invent UI components on the fly.
3. **MCP-UI Governance:** Every interactive component that mutates backend state must be wrapped in an `McpMutation` node.
4. **Testing First:** Write a failing test for the parser before implementing the regex matching.

## COST (Never Break This)
Nothing may call a paid API by default. Tests, demos and checks use mock data (`MockModel`, fake SDK clients). The Claude adapter runs only when `OMNI_MODEL=claude` is set explicitly, and is capped per day. Never run it, or anything else that spends money, without the owner's explicit go-ahead.

## Where things are
- **The syntax is the flat grammar in PLAN.md** ("Syntax decisions" plus runtime rules R1–R7). It is the only Omni-IR syntax; indented `screen / show / ask` examples (e.g. on the landing page) are not Omni-IR.
- `engine/` — line buffer, tokenizer, parser, store; `engine/schema.ts` is the single authority on components, props, flat syntax and document rules.
- `catalog/` — the Trusted Catalog (React components, `omni.css`); `renderer/` — `OmniRenderer`, error boundaries, fallbacks, `McpMutationBoundary`.
- `app/tools.ts` — the tool registry shared by browser, server, tests and demo. Adding a tool needs a param schema here **and** a handler in `server/tools/handlers.ts` (a test enforces this).
- `server/` — Express: `POST /api/generate` (SSE), `POST /api/mutate` (re-validates every action), `GET /api/health`. `server/models/` holds `MockModel` (default) and `ClaudeModel` (opt-in). `server/prompt.ts` generates the system prompt from the schema.
- `client/` — browser helpers `generate()` and `createMutationHandler()`.
- `playground/` — the Interactive Playground (Vite + React). The Express app runs inside the Vite dev server for `/api/*`. State is in `usePlayground.ts`; `Playground.tsx`, `SourceView.tsx`, `Preview.tsx` and `Panels.tsx` are presentation only; `playground.css` is **temporary styling** until the UX design is applied (PLAN-PLAYGROUND.md Task G). Rendered screens keep the catalog's own neutral styles.
- `fixtures/` — the mock model's screens; `fixtures/variants/` — failure cases (`demo: …` prompts).
- PLAN.md (Phase 1–2, done), PLAN-SERVER.md (Step 1, done) and PLAN-PLAYGROUND.md (Step 2; A–F and H done, G waits for the design) are the plans and decision records.

## Commands
- `npm test` — raw-HTML guard + all tests (no network). `npm run typecheck`.
- `npm run server` — Express on :8787 with the free mock model.
- `npm run playground` — the playground on :5173 (mock model, no key). `npm run playground:build` → `dist/playground`.
- `npm run demo` (local fixture) · `npm run demo -- --server "contact support"` (from the running server).
- `npm run prompt:print` — the system prompt; `npm run validate -- reply.omni` — check model output (free manual prompt check).

## License
Apache-2.0.
