# Contributing to Omni-IR

Thanks for helping. Omni-IR is an open standard: a specification ([SPEC.md](SPEC.md)), a conformance suite, and reference implementations in TypeScript, Swift and Kotlin. Contributions to any of them are welcome, from a typo fix to a new renderer.

By taking part you agree to the [code of conduct](CODE_OF_CONDUCT.md). How decisions are made is in [GOVERNANCE.md](GOVERNANCE.md). Report security problems privately, as described in [SECURITY.md](SECURITY.md), never in a public issue.

## Ways to help

- **Try it and report what breaks.** Open the playground, or run a model's reply through `npm run validate`, and file a bug with the stream that misbehaved.
- **Propose a change to the format** with the "Spec proposal" issue template. Changes to the grammar, the document rules or the catalog start as a proposal, before any code.
- **Ask for a component** with the "New component" template: what screen needs it, and what the model would write.
- **Write another implementation.** A parser in another language conforms when it passes every case in [conformance/](conformance/README.md). Tell us about it in an issue and we'll link it.
- **Improve the docs**, including the examples in the READMEs.

## Setting up

You need Node.js 22.22+ or 24.15+.

```bash
npm install
npm test
npm run playground
```

`npm test` runs every test offline. The playground (http://localhost:5173) uses a mock model, so nothing needs an API key.

- **Swift:** `swift test` from the repository root (the SwiftUI views and the demo app build only on macOS). See [swift/README.md](swift/README.md).
- **Kotlin:** `cd android && ./gradlew :omni-ir-core:test :omni-ir-runtime:test` with JDK 21. The Compose catalog and the demo need the Android SDK. See [android/README.md](android/README.md).

## Rules every change follows

1. **Tests first.** Write a failing test before the code that makes it pass. For the parser this is a rule, not a preference.
2. **The schema is the single authority.** Components, props and document rules live in `packages/core/src/schema.ts`. Several files are generated from it, and tests fail if they are stale:
   - `npm run spec` updates the generated sections of SPEC.md
   - `npm run schema:export`, then `npm run conformance:build`, update `conformance/`
   - `npm run swift:schema` and `npm run kotlin:schema` update the Swift and Kotlin catalogs
3. **A behaviour change is a spec change.** Update SPEC.md's hand-written rules, and add conformance cases in `conformance/build.ts` written from the spec (never copied from this implementation's output). All three parsers must pass them.
4. **The model never styles anything.** No HTML, CSS, class names, colours or free-form style props in the format. Visual choices belong to each renderer.
5. **Every action that changes data is governed** by an `McpMutation` naming a tool from the app's registry.
6. **Nothing calls a paid API by default.** Tests, demos and CI use the mock model.
7. **Native code can't crash on input:** no forced unwraps, `try!` or `as!` in Swift, and no `!!` in Kotlin (tests enforce this).

## Pull requests

- Keep each pull request to one change, with tests. Larger work starts with an issue, so the approach can be agreed first.
- Run `npm run typecheck` and `npm test` before opening it. CI also runs the Swift and Kotlin tests.
- Describe what changed and why. For a format change, link the proposal and list the SPEC.md rules and conformance cases it touches.
- Contributions are licensed under [Apache-2.0](LICENSE), the project's licence.

## Where things are

| Path | Contents |
|---|---|
| `SPEC.md` | The specification |
| `conformance/` | Language-neutral test cases for any parser |
| `packages/core/` | `@omni-ir/core`: parser, schema, store |
| `packages/react/` | `@omni-ir/react`: the React catalog and renderer |
| `swift/`, `Package.swift` | The Swift package and iOS demo |
| `android/` | The Kotlin modules and Android demo |
| `server/`, `playground/` | The streaming server and the Interactive Playground |
| `PLAN-*.md` | Plans and decision records for each step |
