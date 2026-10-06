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
- `packages/core/src/` (`@omni-ir/core`) — line buffer, tokenizer, parser, store; `schema.ts` is the single authority on components, props, flat syntax and document rules.
- `packages/react/src/` (`@omni-ir/react`) — `catalog/` the Trusted Catalog (React components, `omni.css`); `renderer/` `OmniRenderer`, error boundaries, fallbacks, `McpMutationBoundary`; `client/` browser helpers `generate()` and `createMutationHandler()`.
- Import the packages by name (`@omni-ir/core`, `@omni-ir/react`, `@omni-ir/react/omni.css`) everywhere outside them. In the repo these resolve to the TypeScript source (`tsconfig.json` paths, `scripts/workspace-aliases.ts` for Vite/Vitest), so nothing needs building. Inside a package, relative imports end in `.js` (Node ESM); the build fails otherwise.
- `Package.swift` (repo root) and `swift/` — the Swift package (PLAN-IOS.md, swift/README.md): `OmniIRCore` (parser, Foundation only, every platform) and `OmniIRSwiftUI` (`Model/`: `OmniStore`, governance, formats, `OmniClient`, Foundation only and tested everywhere; `Views/`: the SwiftUI catalog, Apple platforms only). `Schema.generated.swift` comes from `conformance/schema.json` (`npm run swift:schema`); `swift/Demo/Assets.xcassets` from `app/assets.ts` (`npm run swift:assets`); tests fail if either is stale. Swift sources must contain no forced unwraps, `try!` or `as!` (a test enforces this): SwiftUI can't catch a failing view. `swift test` runs everything but the views; on this Windows ARM64 PC run it from a Visual Studio developer shell (`-arch=arm64`). The SwiftUI views and the demo app (`swift/Demo`, XcodeGen) build only on macOS: iterate on a `wip/**` branch, where CI and the `iOS demo` workflow also run.
- `android/` — Kotlin (PLAN-ANDROID.md, android/README.md): `omni-ir-core` (parser) and `omni-ir-runtime` (store, governance, formats, `OmniClient`) are plain Kotlin on the JVM and tested on this PC (`cd android && .\gradlew.bat :omni-ir-core:test :omni-ir-runtime:test`, JDK 21 at `C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot`); `omni-ir-compose` (Compose catalog) and `demo` need the Android SDK, so Gradle includes them only when one is found: they build on CI (iterate on a `wip/**` branch). `Schema.generated.kt` comes from `conformance/schema.json` (`npm run kotlin:schema`); the demo's drawables from `app/assets.ts` (`npm run android:drawables`); tests fail if either is stale. Kotlin sources must contain no `!!` (a test enforces this).
- `app/tools.ts` — the tool registry shared by browser, server, tests and demo. Adding a tool needs a param schema here **and** a handler in `server/tools/handlers.ts` (a test enforces this).
- `app/assets.ts` — the image asset registry. Streams name pictures (`Image("cabin-pines", …)`), never URLs; pass `assets` to every parser and renderer.
- `server/` — Express: `POST /api/generate` (SSE), `POST /api/mutate` (re-validates every action), `GET /api/health`. `server/models/` holds `MockModel` (default) and `ClaudeModel` (opt-in). `server/prompt.ts` generates the system prompt from the schema.
- `playground/` — the Interactive Playground (Vite + React). The Express app runs inside the Vite dev server for `/api/*`. State is in `usePlayground.ts`; `Playground.tsx`, `SourceView.tsx`, `Preview.tsx` and `Panels.tsx` are presentation only; `playground.css` is the approved design, based on the landing page (PLAN-PLAYGROUND.md Task G); it has light and dark themes, and the preview stage stays light because the catalog is light-only. Rendered screens keep the catalog's own neutral styles.
- `site/` — the public site (PLAN-OPEN.md), built by `npm run site:build` into `dist/site` and by `.github/workflows/site.yml`: `site/landing/` the landing page (Vite + React; its example tabs come from `fixtures/landing/`, checked by the parser at build time), `site/docs/` the hand-written docs pages and VitePress config. `scripts/docs.ts` assembles them with pages generated from SPEC.md and the READMEs into `.docs/` (git-ignored); links between repo files are rewritten, so the Markdown is written once. GitHub Pages serves it at `/omni-ir/` (`OMNI_SITE_BASE`). The site never calls a paid API.
- `fuzz/` — fuzz testing (PLAN-HARDENING.md): `arbitraries.ts` generates random and broken streams (fast-check) for `tests/fuzz.test.ts`; `corpus.json` is a differential corpus of 2,000 streams with the TypeScript results (`npm run fuzz:corpus`, a test fails if stale) that the Swift and Kotlin conformance tests must match exactly. It records what TypeScript does, not the spec: a disagreement is settled by SPEC.md and becomes a conformance case.
- `fixtures/` — the mock model's screens; `fixtures/variants/` — failure cases (`demo: …` prompts).
- `benchmarks/` — the format comparison (Step 9): pinned sources of OpenUI, A2UI and json-render (`sources/`, with licences), converters (`src/`), committed outputs (`out/`, `results.json`). `docs/COMPARISON.md` is the write-up; its tables are generated by `npm run bench` (a test fails if stale). `@openuidev/lang-core` is never a dependency (install telemetry): `benchmarks/checks/openui-parser.mjs` is a manual check.
- PLAN.md (Phase 1–2, done), PLAN-SERVER.md (Step 1, done), PLAN-PLAYGROUND.md (Step 2, done), PLAN-SPEC.md (Step 3, done), PLAN-COMPONENTS.md (Step 4, done) and PLAN-NPM.md (Step 5, done: 0.1.0 on npm) PLAN-IOS.md (Step 6, done) PLAN-ANDROID.md (Step 7, done) PLAN-MULTILINE.md (Step 8, done: Input `lines`) PLAN-COMPARISON.md (Step 9, done: format comparison, decision to keep the explicit flat syntax) PLAN-CATALOG.md (Step 10, done: Select, Switch, Table, Tabs, Notice) and PLAN-CHARTS.md (Step 11, done: BarChart, LineChart, PieChart with Series and Slice) and PLAN-OPEN.md (Step 12, done: the public site at https://jdsouza1.github.io/omni-ir/, deployed from main by `site.yml`; Discussions on). Released: `v0.3.0` on npm and Swift Package Manager (2026-10-05, after `v0.2.0` on 2026-10-04); changes in CHANGELOG.md are the plans and decision records.

## Commands
- `npm test` — raw-HTML guard + all tests (no network). `npm run typecheck`.
- `npm run server` — Express on :8787 with the free mock model.
- `npm run playground` — the playground on :5173 (mock model, no key). `npm run playground:build` → `dist/playground`. `npm run playground:static` → `dist/site/playground`: the hosted playground, with the API answered in the browser (`server/inBrowser.ts`, `playground/inBrowserApi.ts`; `server/api.ts` holds the rules both share, `FixtureModel` the mock model without the file system).
- `npm run demo` (local fixture) · `npm run demo -- --server "contact support"` (from the running server).
- `npm run spec` (or `-- --check`) — regenerate SPEC.md's generated sections. `npm run schema:export` (or `-- --check`) — write `conformance/schema.json`, the language-neutral catalog other renderers generate from. `npm run conformance:build` — write `conformance/cases/*.json` from `conformance/build.ts` (the `catalog` cases are generated from `schema.json`, so export first).
- `npm run bench` (or `-- --check`) — the format comparison, offline. `npm run reliability:page -- out.html` and `npm run comparison:page -- out.html` — the reliability check and review pages (`review/` is git-ignored).
- `npm run prompt:print` — the system prompt; `npm run validate -- reply.omni` — check model output (free manual prompt check).
- `npm run model-check:page -- out.html` — the free model check page: the system prompt and nine test requests to run in the owner's own Claude.ai chat, with the real parser and catalog bundled in to check pasted replies in the browser. Published as an artifact; the owner pastes results back.
- `npm run site:build` — the whole site into `dist/site` (`landing:build`, `playground:static`, `docs:build`); `npm run docs:dev` — the docs with live reload.
- `npm run landing:examples -- page.html out.html` — regenerate the landing page artifact's example tabs from `fixtures/landing/` (explanations in `landing.json`). Get `page.html` with the Artifact tool's read action; publish `out.html` back to the same URL.
- `npm run build:packages` → `packages/*/dist`; `npm run pack:check` — what npm would publish (dry run); `npm run install:test` — install the packed tarballs into a fresh project and render, type-check and Vite-build there (downloads free packages from npm).
- **Never publish to npm without the owner's explicit go-ahead.** `.github/workflows/release.yml` publishes on a `v*.*.*` tag via trusted publishing (no token); each run waits for the owner's approval in the `npm-publish` environment. Release steps are at the end of PLAN-NPM.md.
- `.github/workflows/ios-demo.yml` (macOS): builds the demo app, runs its UI tests in the iPhone simulator, including an end-to-end run against `npm run server:start` (mock model), and uploads screenshots and a recording (artifact `ios-review`) for the owner's review.
- `.github/workflows/fuzz.yml`: the weekly long fuzz run (new seed each Monday, 100,000 runs per TypeScript property, 20,000 per Swift and Kotlin test); opens an issue with the seed and the commands to reproduce if anything fails. Start it by hand from the Actions tab. `npm run test:fuzz` with `FUZZ_SEED` and `FUZZ_RUNS` reproduces locally.
- `.github/workflows/android-demo.yml` (Linux, Android emulator): builds the demo, runs its UI tests including end to end against `npm run server:start` (mock model), and uploads screenshots, a recording and the APK (artifact `android-review`).
- CI: `.github/workflows/ci.yml` runs `npm ci`, typecheck, `npm test`, `playground:build` and the package checks (build, pack check, install test) on Node 22 and 24, `swift test` on Linux and macOS plus an iOS simulator build, and the Kotlin parser and runtime tests on Linux (mock model only, no secrets). Node 22.22+ / 24.15+ required.
- Vite runs with `--configLoader runner` (in the npm scripts and the dev-server test); without it Vite warns about extensionless imports in the config. On Windows, `timeout`/stopping a background task can leave `node.exe` servers running: check and stop leftovers before `npm ci`.

## Open core (owner's decision, 2026-10-04)
This repository is public and is the open standard. Business material (go-to-market strategy, pricing, client work, delivery tooling, the hosted service) lives in a separate private repository and must never be written here: not in docs, plans, commit messages or examples.

## License
Apache-2.0.
