# Omni-IR — Step 7: Android (Jetpack Compose) renderer

Goal: render Omni-IR natively on Android phones and tablets with Jetpack Compose, following the same rules as the web and iOS renderers: the stream only chooses components from the fixed catalog, the renderer owns all styling, and backend actions go through McpMutation governance. This is roadmap Phase 3's second item.

Status: **APPROVED 2026-10-01** with the recommendations: review in the browser (the owner has an Android phone but prefers the browser); Android 8.0 (API 26); Material 3 from the host app's theme; a JDK installed on the owner's PC; publishing decided later with `v0.2.0`.

## Approach (recommended)

The same shape as the iOS renderer, which worked well:

| Module | Contents | Runs on |
|---|---|---|
| `omni-ir-core` | Kotlin parser: line buffer, tokenizer, validation, document rules. Plain Kotlin on the JVM, no Android. | Any JVM, so its tests run on this PC and on Linux CI |
| `omni-ir-compose` | `OmniStore`, governance, formats and the server client (plain Kotlin, tested on the JVM), plus the Compose catalog and `OmniView`. | Android 8.0+ (API 26) |
| `demo` | An Android app that streams the repo's fixtures offline, or asks a running server. | Android |

- **A native Kotlin port** checked against the shared conformance suite (all 63 cases, split at every chunk size), as the Swift port was. No JavaScript engine inside the app.
- **One source of truth:** `Schema.generated.kt` is generated from `conformance/schema.json`, and a test fails if it is stale. The demo's pictures come from `app/assets.ts`.
- **Native look:** components use Material 3 from the host app's theme, so they follow its colours, light and dark mode, and the user's font size. Stream text is always plain text.
- **Failures can't spread:** like SwiftUI, Compose can't catch a component that fails while drawing, so components only receive validated props, and a test keeps `!!` (Kotlin's forced unwrap) out of the sources. SPEC.md's wording from Step 6 already covers this.
- **Everything lives in `android/`** in this repo, built with Gradle (the Gradle wrapper is committed, so nothing else needs installing to build).

## Facts that shape this

- **This PC has no Java and no Android SDK.** The Kotlin parser only needs a Java runtime (JDK 21, free, about 200 MB, with a native ARM64 build). Android builds, screenshots and the emulator run on GitHub's Linux machines.
- **Cost: free.** The JDK, Gradle, the Android SDK and GitHub's Linux runners (including the Android emulator) cost nothing for a public repo. A Google Play developer account ($25) is **not** needed: it's only for the Play Store.
- **Review works like iOS:** screenshots rendered on the JVM with Paparazzi (fast, no emulator), plus a screen recording from a real emulator on CI, collected into one page for you. CI also produces an installable demo APK if you'd like to try it on a phone.
- **Publishing is a separate decision.** Android libraries are usually published to Maven Central, which needs a free account and signing keys. Until then, apps can build from the repo. Nothing is published without your go-ahead.

## Questions for you (with recommendations)

1. **Do you have an Android phone?** *Recommended either way:* review screenshots and a recording in the browser, as with iOS. With a phone, you can also install the demo APK from CI.
2. **Minimum Android version:** *recommended* Android 8.0 (API 26), which covers the large majority of active devices and includes the date and time APIs the renderer needs.
3. **Look:** *recommended* Material 3 from the host app's theme (native, like iOS used the system's styles), rather than copying the web look.
4. **Can I install a JDK on this PC** (Microsoft Build of OpenJDK 21, ARM64, free, via winget)? *Recommended:* yes, so parser tests run locally in seconds. If not, they run on CI only.
5. **Publishing:** *recommended* decide later, after your review, alongside the `v0.2.0` release (Maven Central, with your go-ahead).

## Task checklist

**A. Kotlin parser, tests first** *(checkpoint: failing tests)*
- [x] A.1 Gradle project in `android/` (Kotlin, wrapper committed); `npm run kotlin:schema` writes `Schema.generated.kt` from `conformance/schema.json`, with a staleness test
- [x] A.2 Conformance runner in Kotlin (JUnit): every case, whole and in 1-, 5- and 13-byte chunks, issues as distinct `{line, code}` pairs. Confirm it fails before any parser code exists. *Done 2026-10-01: Gradle 9.8 wrapper, Kotlin 2.4.20, JDK 21 on the owner's PC; all 63 cases fail against the stub parser.*

**B. omni-ir-core** *(checkpoint: all 63 conformance cases pass)*
- [ ] B.1 Line buffer with streaming UTF-8 (split characters wait, invalid bytes become U+FFFD, a leading byte order mark is dropped), lengths in UTF-16 units
- [ ] B.2 Tokenizer with the TypeScript grammar, JavaScript's whitespace and number rules, lenient escapes
- [ ] B.3 Validation from the generated catalog, plus reserved words, the Rating max rule, assets and tools
- [ ] B.4 Document rules, document updates, local state edits, parser events; parser tests beyond the suite
- [ ] B.5 CI: core tests on Linux

**C. omni-ir-compose: model** *(tested on the JVM)*
- [ ] C.1 `OmniStore` (Compose state), slots, `$state` resolution, governance (blocked until a value changes), handler failures
- [ ] C.2 Text formats (currency, date-only values on the same day in every time zone), ratings, dates
- [ ] C.3 Server client: event-stream decoding (tested everywhere) and the HTTP calls for `/api/generate` and `/api/mutate`

**D. omni-ir-compose: views** *(checkpoint: you review screenshots and a recording)*
- [ ] D.1 The 15 catalog components with Material 3, light and dark, font scaling, TalkBack labels (Rating reads "Rated 4.96 out of 5"; Message says who sent it)
- [ ] D.2 `OmniView`: one composable per node id, placeholders and fallbacks; rows that don't fit stack vertically
- [ ] D.3 Input and DateInput edit state locally; images only from the app's picture registry; governed buttons
- [ ] D.4 Test that keeps `!!` out of the sources; Paparazzi screenshot tests

**E. Demo app and CI**
- [ ] E.1 Demo app: fixtures offline, or a live server (`npm run server`, mock model)
- [ ] E.2 Emulator UI tests on Linux CI, including end to end against the Express server, with a screen recording; an installable debug APK
- [ ] E.3 A review page with the screenshots and recording

**F. Docs**
- [ ] F.1 SPEC.md (three reference renderers), README, CLAUDE.md, ROADMAP, `android/README.md`
- [ ] F.2 Release notes: how Android joins `v0.2.0`. Nothing is published or tagged without your go-ahead

## What I needed from you
Answered 2026-10-01: "go with the recommendations"; review in the browser.
