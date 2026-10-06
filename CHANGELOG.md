# Changelog

All notable changes to Omni-IR: the protocol (SPEC.md), the npm packages `@omni-ir/core` and `@omni-ir/react`, the Swift package and the Kotlin modules. One version number covers them all.

## Unreleased

### Changed
- **Negative zero is the number 0** ([4.9]): `-0`, `-0.0`, `-0e5` and underflow such as `-1e-400` are read as 0 by every parser, so no renderer shows "-0". Found by the new differential fuzz corpus, where the Kotlin parser kept -0.
- **Nesting limit** ([4.13]): lists, objects and calls nest at most 8 levels inside a value; deeper is a `syntax` error. Found by fuzzing: lists nested about 9,000 deep overflowed the Kotlin parser's stack, which would crash an Android app. Every parser now stops before recursing that far. New limit `nestingDepth` in `conformance/schema.json`.
- **Tool names are compared exactly** ([5.14], wording only): a malformed name (a look-alike letter from another alphabet, an invisible or full-width character, a space, an upper-case first letter) is `invalid_props`, a well-formed unregistered one is `unknown_tool`. Conformance suite: 84 cases, including `tool-name-spoofing` and `hostile-output`.
- **System prompt:** component signatures now show which props must be named and which are optional (`Image(asset, alt=…, [ratio=…])`, also in SPEC.md); the McpMutation rule says the Button, not the mutation, goes in the layout; values have no expressions. Found by checking Gemini, GPT and Llama.

### Performance
- **Parsing is linear in the length of a stream** on every platform. Each line used to re-check the whole document and copy the document's maps, so time grew with the square of the screen: 5,000 components took 9.6 s in TypeScript. A new incremental index checks only what each line touches (tests compare it with the whole-document check on every line of thousands of fuzz streams), and the stores no longer copy on every line. 20,000 components: TypeScript 0.4 s (was 58 s), Kotlin 0.13 s, Swift through `OmniStore` 0.9 s (was 13.7 s, debug build). Budgets in CI fail if it goes back.
- **TypeScript:** an `OmniDocument` snapshot's maps are now shared with later snapshots and grow in place; read snapshots through selectors (as the renderers do), and copy a map if you need it frozen. **Kotlin:** `OmniDocument` has a new `revision` field, so documents from different moments never compare equal. **Swift:** `OmniStore.document` and `issues` are read from the parser instead of copied.

### Added
- **Fuzz testing:** fast-check properties for the TypeScript parser, and a differential corpus of 2,000 generated streams (`fuzz/corpus.json`) that the Swift and Kotlin parsers must parse exactly as TypeScript does, and seeded no-crash fuzzing inside the Swift and Kotlin test suites (random bytes, token soup, edited fixtures, extreme lines).
- **Adversarial boundary tests** (`tests/security.test.tsx`): look-alike tool names refused by the parser, the browser and the server; hostile output rendered as plain text with nothing loaded, linked or styled; forged requests that mix tools, add keys or change types refused; the unsafe replies from the cross-model check kept as tests.

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
