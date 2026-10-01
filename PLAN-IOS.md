# Omni-IR — Step 6: iOS (SwiftUI) renderer

Goal: render Omni-IR natively on iPhone and iPad with SwiftUI, following the same rules as the web renderer: the model's stream only chooses components from a fixed catalog, the renderer owns all styling, and backend actions go through McpMutation governance. This is roadmap Phase 3's first item.

Status: **APPROVED 2026-09-30** with the recommendations: review in the browser (CI screenshots and recording); Swift code in this repo with one version number for the whole project; iOS 17 and macOS 14; spec wording for failures changed as in question 4; system dark mode and Dynamic Type; the free Swift toolchain installed on the owner's PC.

## Approach (recommended)

A **native Swift port**, checked against the shared conformance suite, rather than running the TypeScript parser inside iOS's JavaScript engine. The spec and conformance suite exist so that other languages can implement Omni-IR exactly; a native port is faster, has no JavaScript bridge, and proves the spec is complete.

One Swift package, `OmniIR`, with two libraries:

| Library | Contents | Runs on |
|---|---|---|
| `OmniIRCore` | Line buffer, tokenizer, schema validation, document rules, store. Foundation only. | iOS, macOS, Linux and Windows, so its tests can run without a Mac |
| `OmniIRSwiftUI` | The Trusted Catalog as SwiftUI views, `OmniView` (the renderer), McpMutation governance, streaming client. | iOS 17+ and macOS 14+ |

Plus a small **demo app** that streams the repo's fixtures offline (no server, no API key), like the mock model.

**One source of truth for the catalog.** `packages/core/src/schema.ts` stays the authority. A script exports it as a language-neutral `schema.json` (components, positional args, prop types, allowed values, limits, issue codes), and the Swift prop definitions are generated from that file. A test fails if either is stale, the same way SPEC.md is kept in step. The Android renderer can reuse `schema.json` later.

## Facts that shape this

- **This PC has no Swift or Xcode.** SwiftUI only builds on macOS. `OmniIRCore` can be built and tested on Windows with the free Swift toolchain, or on GitHub's Linux runners.
- **Cost: free.** The Swift toolchain is free, and GitHub-hosted macOS and Linux runners are free for public repositories. Apple's Developer Program ($99/year) is **not** needed: it's only for the App Store, TestFlight, or installing the demo on a phone without a Mac.
- **SwiftUI has no error boundaries.** A view that crashes takes down the app, so SPEC.md section 8 ("if rendering one component fails, only that component MUST be replaced by a fallback") can't be met the React way. The Swift design makes rendering unable to fail instead: views only receive already-validated, typed props, with no force-unwraps; the spec wording needs a matching platform-neutral version (question 4).
- **Swift Package Manager needs `Package.swift` at the repository root** to install a package from a GitHub URL, and it uses git tags as versions. The npm release workflow also runs on `v*` tags, so the two would share version numbers if they share a repo (question 2).
- **Constraint 4 (tests first)** applies: the Swift conformance runner is written and seen failing before the tokenizer and parser exist.

## Questions for you (with recommendations)

1. **Do you have a Mac or an iPhone?**
   *Answered 2026-09-30:* a Mac is available in the household, but the owner works on Windows. **Review happens in the browser:** CI runs the demo in the iPhone simulator and saves screenshots of every example (light and dark, normal and large text) plus a short screen recording of a screen streaming in and a governed button being tapped; Claude collects them into one page with a link. Running the demo on the Mac is optional, at most once near the end.
2. **Where should the Swift code live?**
   *Recommended:* in this repo (`swift/`, with `Package.swift` at the root), sharing the spec, fixtures and conformance suite, with **one version number for the whole project**: every release tags all packages together (npm and Swift). The alternative is a separate `omni-ir-swift` repo with its own versions.
3. **Minimum OS:** *recommended* iOS 17 and macOS 14, which allows SwiftUI's modern state tracking (`@Observable`) and covers the large majority of active devices.
4. **Spec change for failures:** *recommended* reword section 8 to: a renderer MUST isolate component failures where its platform can catch them (web); where it can't (SwiftUI), it MUST make component rendering unable to fail, by validating props before rendering and never trapping on stream data. Same rule, two ways to meet it.
5. **Dark mode and text size:** *recommended* the iOS catalog follows the system's light/dark setting and Dynamic Type (the user's text size) from the start. The web catalog stays light-only for now.
6. **Can I install the Swift toolchain on this PC** (free, from swift.org, about 3 GB with Visual Studio Build Tools)?
   *Recommended:* yes, so core tests run locally in seconds. If not, everything still works through CI, just with slower feedback.

## Task checklist

**A. Language-neutral schema**
- [ ] A.1 `npm run schema:export` writes `conformance/schema.json` from the TypeScript schema; a test fails if it's stale
- [ ] A.2 Catalog conformance cases generated from `schema.json`: for every component and prop, an accepted line and rejected lines (wrong type, unknown value, too long, missing required), so another implementation is checked prop by prop, not only on document rules

**B. Swift package, tests first** *(checkpoint: failing tests)*
- [ ] B.1 `Package.swift` at the root, `swift/Sources/OmniIRCore`, `swift/Tests/OmniIRCoreTests`; Swift 6 language mode with strict concurrency
- [ ] B.2 Conformance runner in Swift: loads every `conformance/cases/*.json`, feeds the input in 1-, 5- and 13-byte chunks, and compares issues, nodes, state, mutations and missing references. Confirm it fails before any parser code exists

**C. OmniIRCore** *(checkpoint: all conformance cases pass on Linux, and Windows if installed)*
- [ ] C.1 Line buffer: UTF-8 split across chunks, `\r\n`, invalid bytes become U+FFFD, 16 KB line limit
- [ ] C.2 Tokenizer: the same grammar and lenient escapes as `tokenizer.ts`, written test-first
- [ ] C.3 Statement validation from the generated schema (`Schema.generated.swift`), plus the hand-written refinements (Rating within max, dates, asset names, reserved words)
- [ ] C.4 Document rules: root, duplicates, parents, cycles, lists, governance, dangling and missing references, end-of-stream checks
- [ ] C.5 Store: snapshots with stable identity per node, state updates for Input and DateInput, change notifications
- [ ] C.6 Tool registry protocol (each tool validates its own params) and asset registry (names only)

**D. OmniIRSwiftUI: catalog and renderer** *(checkpoint: you review simulator screenshots)*
- [ ] D.1 The 15 catalog components as SwiftUI views with native styling, light and dark, Dynamic Type and VoiceOver labels (Rating reads "Rated 4.96 out of 5"; Message says who sent it)
- [ ] D.2 `OmniView`: one view per node id so components keep their identity while streaming; placeholders for pending parts, fallbacks for missing ones
- [ ] D.3 McpMutation governance: buttons stay disabled until governed; on tap, fill in state, validate params with the tool registry, then call the app's handler; report failures as events
- [ ] D.4 Input and DateInput edit state locally, never calling the backend by themselves
- [ ] D.5 Images only from the app's asset registry (e.g. the asset catalog); alt text shown when a picture is missing
- [ ] D.6 Text formats: currency and date-only values shown as the same calendar day in every time zone

**E. Streaming client**
- [ ] E.1 `generate(prompt:)`: reads the reference server's `/api/generate` stream (URLSession) into the parser; cancel and error outcomes like the web client
- [ ] E.2 `createMutationHandler()`: posts actions to `/api/mutate` and reports refusals

**F. Demo app and CI**
- [ ] F.1 Demo app: pick any fixture (including the landing examples and failure demos) and watch it stream offline, or connect to `npm run server` on the same network. Mock data only; nothing paid
- [ ] F.2 Tests on the view layer (what each node resolves to, disabled/enabled buttons, state binding) and one simulator UI test that streams a screen and taps a governed button
- [ ] F.3 CI: core tests on Linux; package tests, demo build and UI test on macOS with the iPhone simulator; screenshots and a screen recording uploaded, and collected into one review page for the owner

**G. Spec and docs**
- [ ] G.1 SPEC.md section 8 failure wording (question 4); note which tests cover the Swift renderer
- [ ] G.2 README (installing with Swift Package Manager), CLAUDE.md, ROADMAP; Swift README with an example
- [ ] G.3 Release notes on versioning (question 2). Nothing is tagged or released without your go-ahead

## What I needed from you
Answered 2026-09-30: "go with the recommendations" for questions 2–6; question 1 as recorded above.
