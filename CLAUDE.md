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
- **SPEC.md is the specification** of the format (grammar, document rules, catalog, issue codes, renderer requirements). Its component tables, issue codes, limits and examples are generated from the schema (`npm run spec`); a test fails if it is stale. Keep its hand-written rules in step with any behaviour change. The flat grammar is the only Omni-IR syntax; indented `screen / show / ask` examples are not Omni-IR.
- `conformance/` — language-neutral cases for any parser. Edit `conformance/build.ts`, then `npm run conformance:build`; every rule in SPEC.md sections 3–7 must be covered by a case (a test enforces this). Expected results are written from the spec, never copied from this implementation's output.
- `engine/` — line buffer, tokenizer, parser, store; `engine/schema.ts` is the single authority on components, props, flat syntax and document rules.
- `catalog/` — the Trusted Catalog (React components, `omni.css`); `renderer/` — `OmniRenderer`, error boundaries, fallbacks, `McpMutationBoundary`.
- `app/tools.ts` — the tool registry shared by browser, server, tests and demo. Adding a tool needs a param schema here **and** a handler in `server/tools/handlers.ts` (a test enforces this).
- `server/` — Express: `POST /api/generate` (SSE), `POST /api/mutate` (re-validates every action), `GET /api/health`. `server/models/` holds `MockModel` (default) and `ClaudeModel` (opt-in). `server/prompt.ts` generates the system prompt from the schema.
- `client/` — browser helpers `generate()` and `createMutationHandler()`.
- `playground/` — the Interactive Playground (Vite + React). The Express app runs inside the Vite dev server for `/api/*`. State is in `usePlayground.ts`; `Playground.tsx`, `SourceView.tsx`, `Preview.tsx` and `Panels.tsx` are presentation only; `playground.css` is a **first design pass** based on the landing page (PLAN-PLAYGROUND.md Task G), awaiting the owner's review; it has light and dark themes, and the preview stage stays light because the catalog is light-only. Rendered screens keep the catalog's own neutral styles.
- `fixtures/` — the mock model's screens; `fixtures/variants/` — failure cases (`demo: …` prompts).
- PLAN.md (Phase 1–2, done), PLAN-SERVER.md (Step 1, done), PLAN-PLAYGROUND.md (Step 2; A–F and H done, G waits for the design) and PLAN-SPEC.md (Step 3, done) are the plans and decision records.

## Commands
- `npm test` — raw-HTML guard + all tests (no network). `npm run typecheck`.
- `npm run server` — Express on :8787 with the free mock model.
- `npm run playground` — the playground on :5173 (mock model, no key). `npm run playground:build` → `dist/playground`.
- `npm run demo` (local fixture) · `npm run demo -- --server "contact support"` (from the running server).
- `npm run spec` (or `-- --check`) — regenerate SPEC.md's generated sections. `npm run conformance:build` — write `conformance/cases/*.json` from `conformance/build.ts`.
- `npm run prompt:print` — the system prompt; `npm run validate -- reply.omni` — check model output (free manual prompt check).
- `npm run landing:examples -- page.html out.html` — regenerate the landing page artifact's example tabs from `fixtures/landing/` (explanations in `landing.json`). Get `page.html` with the Artifact tool's read action; publish `out.html` back to the same URL.
- CI: `.github/workflows/ci.yml` runs `npm ci`, typecheck, `npm test` and `playground:build` on Node 22 and 24 (mock model only, no secrets). Node 22.22+ / 24.15+ required.
- Vite runs with `--configLoader runner` (in the npm scripts and the dev-server test); without it Vite warns about extensionless imports in the config. On Windows, `timeout`/stopping a background task can leave `node.exe` servers running: check and stop leftovers before `npm ci`.

## License
Apache-2.0.
