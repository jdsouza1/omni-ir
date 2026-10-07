# Changelog

All notable changes to Omni-IR: the protocol (SPEC.md), the npm packages `@omni-ir/core` and `@omni-ir/react`, the Swift package and the Kotlin modules. One version number covers them all.

## 0.10.1 (2026-10-07)

The first release of `@omni-ir/mcp` (with `@omni-ir/core` and `@omni-ir/react` at the same version). Its first version, 0.10.0, was published by hand without its `npx` command: npm 11 silently drops a `bin` path written `./dist/bin.js`. 0.10.1 fixes the path, and the pack check now fails whenever npm would change a package's manifest at publish time. `@omni-ir/core` and `@omni-ir/react` 0.10.0 were never published.

### Added
- **`@omni-ir/mcp`, the MCP Apps bridge** (Step 18, PLAN-MCPAPPS.md): Omni-IR screens inside Claude, ChatGPT, VS Code, Cursor and other hosts of MCP Apps. The host's model calls `show_screen` with Omni-IR (the tool's description is a compact guide generated from the schema, the app's tools and pictures, under 1,500 tokens); the host draws it with a view that bundles the parser and the Trusted Catalog into one HTML file with no network access (about 550 KB). The screen builds line by line from the host's partial tool input, in the host's colours and light or dark theme (each colour kept only if every contrast pair still passes). The result tells the model which lines were rejected, so it can fix them.
- **Actions from conversations:** each registered tool is an MCP tool only the view can call (`visibility: ["app"]`), with a new idempotency key per press; the server checks it against the tool's own schema before the app's code runs. `npx @omni-ir/mcp` runs a screens-only server over stdio.
- The reference server: `OMNI_MCP=on` serves the bridge at `/mcp`, with actions through the same checks as `/api/mutate` (access rules, ownership, idempotency, audit trail), the person from a bearer token (never a cookie), and counts of screens and actions in `/api/health` and the log. `npm run mcp` runs it over stdio for a local host.
- SPEC.md section 10, "Over MCP Apps": rules [10.25] to [10.28]. Package checks: the pack check and the install test cover the new package, including its stdio server.

## 0.9.0 (2026-10-07)

### Added
- **Model check, 2FA-style** (Step 17, PLAN-MODELCHECK.md): before a model writes screens for people, the reference server challenges it with six requests drawn at random from `app/challenges.ts` (40 requests: 30 ordinary screens and 10 that push against the rules) and scores each reply with the real parser. Every reply must have no parse error, and five of six must have what the request needed. A pass clears one setup (model, system prompt and settings, catalog, tools, pictures) for seven days; more than 10% of recent live replies with errors trigger a new challenge, at most once an hour. It checks proficiency, not safety: the parser still checks every line.
- `OMNI_MODEL_CHECK` (`enforce`, `warn`, `off`): `enforce` by default with `OMNI_MODEL=claude`, `off` with the mock. While a setup is unverified and the check is enforced, the generate and AG-UI routes answer `503 model_unverified`, retryable, with `Retry-After`. `GET /api/health` shows the check's state; each challenge is logged and kept in the store (`modelChecks`, memory or SQLite), with request ids and scores only.
- `npm run model:challenge [-- --seed N]`: one challenge against the configured model, with each reply's score (free with the mock model).
- SPEC.md section 10, "Checking the model" (optional for servers): rules [10.21] to [10.24], and `model_unverified` in [10.2]'s table. A new transport case, passed by the web, iOS and Android clients. Guide: Checking the model.

## 0.8.0 (2026-10-07)

### Changed
- **The stream format has its own version** (PLAN-VERSIONING.md): `FORMAT_VERSION`, `0.5`, the last release whose changes touched the format. The version marker, the `newer_version` check, a client's `?version=`, the server's check and AG-UI's `content.version` all carry it, instead of the package release. Packages carry on as `0.8.0`. `FORMAT_VERSION`, `formatOf()` and `canRead()` in `@omni-ir/core`; `formatVersion` in `conformance/schema.json`; `omniIRFormatVersion` (Swift) and `FORMAT_VERSION` (Kotlin).
- **Servers serve any client that reads their format** ([10.12]): `unsupported_version` only when the client asked for an older format. Formats only add within 0.x, so a client reads its own format and every older one.
- **Old numbers understood:** markers and requests naming `0.6` or `0.7` mean format `0.5` ([3.9]). The next format version is `0.8`.
- **Clients retry once without a version** when a server answers `unsupported_version` (servers 0.6 and 0.7 compared versions exactly).
- SPEC.md names both numbers: "Specification 0.8 (draft) · stream format 0.5", and section 12 explains them. A test fingerprints the format and fails if it changes without a new format version.

### Compatibility

| | 0.8 server | 0.6 or 0.7 server | 0.5 server |
|---|---|---|---|
| **0.8 app** | works | refused, then works on the retry | works |
| **0.6 or 0.7 app** | works, no update notice (was refused) | as before | as before |
| **0.5 app** | works, no update notice | as before | works |

## 0.7.0 (2026-10-06)

### Added
- **Design tokens** (PLAN-THEMES.md): one list of about 30 colours plus a font and a corner radius, with light and dark defaults, written once (`packages/react/src/catalog/theme.ts`, exported to `conformance/theme.json`) and generated into Swift and Kotlin (`OmniPalette`) by `npm run theme`. Apps set them; the stream can't.
- **Web theming and dark mode:** `omni.css` draws only with CSS variables (`--omni-accent`, …), so an app rebrands by setting a few on `.omni-root`. `OmniRenderer` takes `theme="light" | "dark" | "system"`, light by default. The playground's preview follows its own theme. The web catalog uses direction-neutral CSS (start and end), ready for right-to-left languages later.
- **Contrast tests:** every pair a reader depends on meets WCAG AA in the light and dark defaults.
- **The renderer's own words** ("Loading", "Component failed to load", "Rated 4.5 out of 5", "Choose a date", the version notice, …) in one English table, replaceable by the app: `OmniRenderer`'s `strings`, `.omniStrings(…)` in SwiftUI, `OmniView(strings = …)` in Compose. Shown as plain text, with placeholders filled in one pass (`fillTemplate`), never through formatting functions.
- `ENGLISH`, `resolveStrings`, `fillTemplate`, `LIGHT`, `DARK`, `COLOR_TOKENS`, `CONTRAST_PAIRS` and `contrast` exported from `@omni-ir/react`.

### Changed
- **A blocked action shows a plain sentence** ("This can't be sent. Check the details and try again.") instead of the validation text (`amount: Too small…`); the detail still goes to `onEvent`.
- **Input borders are darker** (#868c97, was #c3c7ce): the old ones were 1.7:1 against white, under the 3:1 a control's edge needs. Everything else in the light theme looks as before.
- **Chart colours** (the owner's choice, 2026-10-06): every colour now stands out at least 3:1 from the background in light and dark. Green, amber and pink were darker than before, and the order changed so the first four series stay far apart for colour-blind viewers: blue, orange, pink, purple, then green, amber, dark green, red. Charts with one or two series look as before; charts with three or more show their series in the new order. The dark chart colours are the light ones, lightened only where needed, which fixed two dark colours that looked almost the same to people with deuteranopia. Tests simulate protanopia, deuteranopia and tritanopia.
- iOS and Android take their fixed colours (charts, notices, badges, rating stars, the version notice) from the shared defaults, so the three platforms match.
- Custom React catalogs receive a new `strings` prop alongside `locale`.

### Compatibility
- **The text format didn't change.** As with every 0.x minor release, a 0.7 server writes `# omni-ir 0.7` and refuses apps that ask for another version; update the server and the apps together.
- **The web catalog's look:** light stays the default. Input borders are darker, and charts with three or more series show their colours in the new order. An app that overrode our CSS classes should move to the `--omni-*` variables, which stay stable.
- **Custom React catalogs** get a `strings` prop; components that ignore it keep working. `SkeletonLines` now takes a `label`.
- **Swift:** `Format.RatingModel.label` is now a function, `label(_ template:)`. **Kotlin:** `RatingModel.label` is now `label(template)`; `OmniView` takes an optional `strings`.

## 0.6.0 (2026-10-06)

### Added
- **Real backend handlers in the reference server** (PLAN-BACKEND.md): every tool has an access rule ("signed-in" or "public"; a tool without one doesn't load), checks ownership against stored data, and answers `404 not_found` the same for "not yours" and "doesn't exist". Results carry only what a screen needs.
- **Sign-in by emailed link:** single-use links valid for 15 minutes, stored as hashes; at most five an hour per address, with the same answer either way. Browsers get an `HttpOnly`, `SameSite=Lax` session cookie; native apps a bearer token (`POST /api/auth/session`). `POST /api/auth/signout`, `GET /api/auth/me`. Apps plug in their own sign-in with `createApp({ authenticate })`. A development outbox prints links; nothing is sent.
- **Idempotency keys** ([10.14]): an optional `Idempotency-Key` header that servers performing real actions SHOULD honour. The reference server keeps each person's answers for 24 hours and refuses a key reused for other params (`409 idempotency_conflict`). `createMutationHandler` and the Swift and Kotlin `OmniClient`s send a key per press and retry once after a dropped connection with the same key.
- **Storage:** a `Store` interface with an in-memory version and one on Node's built-in SQLite (`OMNI_DB`), no dependency.
- **Audit trail and limits:** every action is recorded (who, tool, time, outcome), never param values; requests are limited per signed-in person as well as per address.
- **Settings:** `OMNI_AUTH` (`magic-link`, or `demo` for the playground and demo apps), `OMNI_PUBLIC_URL`, `OMNI_DB`. The playground and the hosted playground act as a labelled demo visitor.
- `createMutationHandler` takes `credentials` and `token`; `MutationRejectedError.code` gives the server's error code. `OmniClient` takes a `token` on iOS and Android.

### Changed
- SPEC.md section 9: ownership is checked against the server's own data, "not yours" looks like "doesn't exist", results and logs carry no one else's data. [10.14] lists `401 sign_in_required`, `403 bad_origin`, `404 not_found` and the `409` answers.
- `/api/mutate` now needs a signed-in person for every tool except sending a sign-in link (unless `OMNI_AUTH=demo`). The stub handlers are gone; `assistant.ask` stays a labelled stub because a real one would call a paid model.

### Compatibility
- **The text format didn't change**: every 0.5 stream parses the same. But the version did, and until 1.0 any minor version may be incompatible ([12]): a 0.6 server writes `# omni-ir 0.6`, so 0.5 apps show the "needs an update" notice, and it refuses apps that ask for `?version=0.5` (`unsupported_version`). Update the server and the apps together, as before.
- **A reference server deployed before 0.6 now requires sign-in** for actions. Set `OMNI_AUTH=demo` only for a demo; otherwise sign people in, or plug in your own `authenticate`.
- 0.5 clients send no idempotency key and still work; 0.6 clients' extra header is ignored by servers that don't use it.

## 0.5.0 (2026-10-06)

### Added
- **The transport is a standard** (SPEC.md section 10, rules [10.1]–[10.20], no longer informative): the request, the error body and its codes, the events and the terminal event, keep-alive pings, what a client does with each event and when the connection drops, no resumption, the action endpoint's answers, and rate limits behind a proxy. Any client now works with any server that follows it.
- **Transport conformance cases** (`conformance/transport/`, 21 cases): server answers in, the text a client writes to its parser and the outcome out, each fed whole and split into reads of 1, 5 and 13 bytes. The web (`generate()`), iOS and Android (`OmniClient`) clients pass all of them.
- **Stream versions:** a server writes `# omni-ir 0.5` as a stream's first line ([3.9], [10.13]). Older parsers read it as a comment. A parser built for an older version reports the new warning `newer_version`, keeps parsing, and the web, SwiftUI and Compose renderers show that the app needs an update. Clients send their version with each request (`?version=0.5`), and a server that can't write that version answers `unsupported_version` before streaming. `OMNI_IR_VERSION`, `majorMinor()` and `versionMarker()` in `@omni-ir/core`; `OmniDocument.newerVersion` on all three platforms.
- **AG-UI** ([10.18]–[10.20]): a screen travels as one activity message of type `omni-ir`, one added line per update. `@omni-ir/core/ag-ui` has `AgUiEncoder` (for agent backends) and `createAgUiReader` (for apps), which accepts only added lines. The reference server answers AG-UI's run input at `POST /api/ag-ui`. Every event is checked against AG-UI's own schemas in the tests. Governed actions never go through the agent.
- **WebSockets** are specified ([10.16]–[10.17], including the origin check browsers don't do), but not built.
- **Idle timeout:** all three clients treat 45 seconds without any bytes as `connection_lost` (`idleTimeoutMs`, `idleTimeout`, `idleTimeoutMillis`).
- **`OMNI_TRUST_PROXY`** for the reference server: which proxies may report the client's address, so rate limits work per client behind a load balancer. Off by default; `true` is refused.

### Changed
- The reference server's streams start with the version marker line, so the screen's line numbers are one higher than the model's text.
- Clients ignore every event after the first `done` or `error` ([10.8]).

### Compatibility
- **Mixing versions:** 0.5 clients send `?version=0.5`, which 0.4 servers ignore. A 0.5 server answers `unsupported_version` only to a client that asks for another version; 0.4 clients ask for none. As before, use the same version for the server and the apps.
- **Line numbers:** the reference server's streams start with the version marker, so issues in a model's text are reported one line lower than before. Code that compares a received stream with the model's text should expect the marker line first.
- **TypeScript:** `OmniDocument` has a new field, `newerVersion`; a custom `OmniStore` may implement the new optional `markNewerVersion()`. **Swift and Kotlin:** `OmniDocument.newerVersion` (default false), and `OmniClient` takes an optional idle timeout.

## 0.4.0 (2026-10-06)

### Changed
- **Negative zero is the number 0** ([4.9]): `-0`, `-0.0`, `-0e5` and underflow such as `-1e-400` are read as 0 by every parser, so no renderer shows "-0". Found by the new differential fuzz corpus, where the Kotlin parser kept -0.
- **Nesting limit** ([4.13]): lists, objects and calls nest at most 8 levels inside a value; deeper is a `syntax` error. Found by fuzzing: lists nested about 9,000 deep overflowed the Kotlin parser's stack, which would crash an Android app. Every parser now stops before recursing that far. New limit `nestingDepth` in `conformance/schema.json`.
- **Tool names are compared exactly** ([5.14], wording only): a malformed name (a look-alike letter from another alphabet, an invisible or full-width character, a space, an upper-case first letter) is `invalid_props`, a well-formed unregistered one is `unknown_tool`. Conformance suite: 85 cases, including `tool-name-spoofing` and `hostile-output`.
- **Document size limit** ([5.25]): a stream may define at most 1,000 components (McpMutations included) and 1,000 `$state` keys. A line past either limit is a new `document_too_large` error and is rejected; the screen keeps what it has. New limits `components` and `stateKeys` in `conformance/schema.json`. Keeps a runaway or hostile stream from making a client hold or draw an unbounded screen.
- **System prompt:** component signatures now show which props must be named and which are optional (`Image(asset, alt=…, [ratio=…])`, also in SPEC.md); the McpMutation rule says the Button, not the mutation, goes in the layout; values have no expressions. Found by checking Gemini, GPT and Llama.

### Performance
- **Parsing is linear in the length of a stream** on every platform. Each line used to re-check the whole document and copy the document's maps, so time grew with the square of the screen: 5,000 components took 9.6 s in TypeScript. A new incremental index checks only what each line touches (tests compare it with the whole-document check on every line of thousands of fuzz streams), and the stores no longer copy on every line. 20,000 components: TypeScript 0.4 s (was 58 s), Kotlin 0.13 s, Swift through `OmniStore` 0.9 s (was 13.7 s, debug build). Budgets in CI fail if it goes back.
- **TypeScript:** an `OmniDocument` snapshot's maps are now shared with later snapshots and grow in place; read snapshots through selectors (as the renderers do), and copy a map if you need it frozen. **Kotlin:** `OmniDocument` has a new `revision` field, so documents from different moments never compare equal. **Swift:** `OmniStore.document` and `issues` are read from the parser instead of copied.

### Added
- **Fuzz testing:** fast-check properties for the TypeScript parser, and a differential corpus of 2,000 generated streams (`fuzz/corpus.json`) that the Swift and Kotlin parsers must parse exactly as TypeScript does, and seeded no-crash fuzzing inside the Swift and Kotlin test suites (random bytes, token soup, edited fixtures, extreme lines).
- **Adversarial boundary tests** (`tests/security.test.tsx`): look-alike tool names refused by the parser, the browser and the server; hostile output rendered as plain text with nothing loaded, linked or styled; forged requests that mix tools, add keys or change types refused; the unsafe replies from the cross-model check kept as tests.

### Compatibility
- **Streams that were accepted before can now be rejected:** values nested deeper than 8 levels (`syntax`), and lines past 1,000 components or 1,000 state keys (`document_too_large`). Real screens are far below both limits. Older parsers don't know `document_too_large`; use the same version for the server that writes streams and the apps that render them.
- **TypeScript:** code that kept an old `OmniDocument` snapshot and read its maps later will see later additions; copy the map to keep it frozen. **Kotlin:** `OmniDocument` has a new `revision` field (default 0), so two documents from different moments never compare equal.

## 0.3.0 (2026-10-05)

### Added
- **Charts:** `BarChart` and `LineChart` (values across categories or over time, holding `Series`) and `PieChart` (parts of a whole, holding `Slice`). Each series or slice is its own line, so a chart fills in as the stream arrives. Charts carry a title, labels, numbers and an optional `format` (`number`, `currency` or `percent`) only: colours, line styles, legends and value readouts belong to the renderer. Web (SVG, no library), SwiftUI (Swift Charts) and Compose (Canvas), each with a hidden data table or accessibility descriptions. The catalog now has 27 components plus McpMutation.
- **Issue code:** `chart_mismatch` (charts hold only their own kind of item, each item sits in a chart, and a Series has one value per label). Styling props on charts (`color`, `style`, `animation`, `tooltip`) are `invalid_props`. SPEC.md rules [5.23]–[5.24] and the renderer rules for charts.
- **Conformance suite:** 80 cases (from 73), passed by the TypeScript, Swift and Kotlin parsers.
- **System prompt:** when to use each chart, and that the app chooses colours, styles and animation.

### Compatibility
- **Older parsers reject the chart components** (`unknown_component`). Use the same version for the server that writes streams and the apps that render them.
- **Custom React catalogs** passed to `OmniRenderer` must now also provide `BarChart`, `LineChart`, `PieChart`, `Series` and `Slice`. Start from `DEFAULT_CATALOG` and replace only what you need.

## 0.2.0 (2026-10-04)

### Added
- **New components:** `Select` (pick one option; edits a text `$key`), `Switch` (on/off; edits a true/false `$key`), `Table` and `TableRow` (rows of text or numbers under column headings, one line per row), `Tabs` and `Tab` (sections of one screen; which tab is open is the viewer's choice), and `Notice` (an info, success, warning or danger message). The catalog now has 22 components plus McpMutation.
- **Multi-line text boxes:** `Input` takes `lines` (1–10).
- **Issue codes:** `table_mismatch` (a Table holds only TableRows, each TableRow sits in a Table and has one cell per column) and `tabs_mismatch` (Tabs hold only Tab, and a Tab sits in Tabs). `input_state_type` now also covers a Select bound to state that isn't text and a Switch bound to state that isn't true or false. SPEC.md rules [5.20]–[5.22] and the renderer rules for tables and tabs.
- **Swift package (first release):** `OmniIRCore` (parser, every platform) and `OmniIRSwiftUI` (SwiftUI renderer for iOS 17+ and macOS 14+), installable with Swift Package Manager from this repository.
- **Kotlin:** `omni-ir-core`, `omni-ir-runtime` and `omni-ir-compose` (Jetpack Compose renderer) in `android/`. Not on Maven Central yet; include the modules from this repository.
- **Conformance suite:** 73 cases (from 63), passed by the TypeScript, Swift and Kotlin parsers.
- **System prompt:** rules for the new components, for choosing tools, for Ratings and Skeletons, and for a Select's starting state.

### Compatibility
- **Older parsers reject the new components and the `lines` prop** (`unknown_component`, `invalid_props`). Use the same version for the server that writes streams (its system prompt is generated from its schema) and for the apps that render them.
- **Custom React catalogs** passed to `OmniRenderer` must now also provide `Select`, `Switch`, `Table`, `TableRow`, `Tabs`, `Tab` and `Notice`. Start from `DEFAULT_CATALOG` and replace only what you need.

## 0.1.0 (2026-09-30)

First release of `@omni-ir/core` and `@omni-ir/react`: the protocol draft, the streaming parser and schema, and the React Trusted Catalog with McpMutation governance.
