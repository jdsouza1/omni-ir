# Omni-IR — Step 16: themes and the renderer's own words

Goal: an app can make Omni-IR screens look and read like the rest of the app, and the model still can't touch any of it. Four goals:

1. **Your brand, set once:** colours, font and corner radius from one short list of settings, on the web as CSS variables.
2. **Dark mode on the web**, which is light only today.
3. **Readable for everyone:** tests prove the default themes meet the accessibility contrast standard in light and dark.
4. **The renderer's own words can be replaced**, so an app in any language isn't stuck with English labels; and a blocked action shows a plain sentence instead of developer text.

Status: **APPROVED 2026-10-06** in a leaner form, at the owner's choice: the full theming API on iOS and Android, and built-in translations, wait for real demand ("I have no idea yet if people will adopt this; translations are overkill"). Free: no paid API, no new service. Released as `v0.7.0` only with a separate go-ahead.

## Where things stand

- **Web:** `omni.css` writes 24 colour values straight into its rules, with no variables, so an app can only rebrand by overriding our classes. Light only; the playground keeps its preview stage light for that reason.
- **iOS** follows the system's light or dark mode and the app's accent colour, plus a few fixed colours (the version notice, charts). **Android** takes most colours from the app's Material 3 theme, plus 9 fixed colours.
- **The renderers' own words** are fixed English on all three: "Loading", "Component failed to load" and "…to render", "Rated 4.96 out of 5", "You:" and "Assistant:" for screen readers, "Value" in a chart's data table, "Choose a date", "Cancel", "Sections", and the "needs an update" notice.
- **A blocked action** shows the raw validation text to the person, such as `amount: Too small: expected number to be >0`.

## Proposal

**1. One short list of design tokens.**

| Token | What it colours or sets |
|---|---|
| `background`, `surface` | The page behind a screen, and cards and inputs |
| `text`, `mutedText` | Body text, and secondary text (`tone="muted"`) |
| `border` | Card, input and table borders |
| `accent`, `onAccent` | Primary buttons, focus rings and selected states, and the text on them |
| `info`, `success`, `warning`, `danger` | Notices and badges, each with a soft background |
| `chart1`…`chart6` | Series and slices, distinguishable for colour-blind viewers |
| `font`, `radius` | The font family, and the corner radius of cards, inputs and buttons |

- Written once with light and dark defaults (`conformance/theme.json`, exported from TypeScript like `schema.json`) and generated into Swift and Kotlin, so the names are fixed now and the platforms can't drift.
- **Web:** CSS variables (`--omni-accent`, …), today's look as the light default. An app sets the ones it wants.
- **iOS and Android:** no new setting. Their fixed colours (the version notice, chart colours) come from the shared defaults instead of being written in place; everything else keeps following the system look and the app's accent (iOS) or Material theme (Android). A theming setting on mobile can be added later without breaking anyone.
- **Contrast tests** for every pair a reader depends on, in light and dark: text and muted text on background and surface at least 4.5:1 (WCAG AA), text on accent at least 4.5:1, borders at least 3:1.

**2. A dark theme for the web.** `OmniRenderer` takes `theme="light" | "dark" | "system"`, light by default. Dark values for every token, including the chart colours. The playground's preview follows the playground's theme. The web catalog also switches to direction-neutral CSS (start and end instead of left and right), which costs little and makes right-to-left languages easier later.

**3. The renderer's own words, in English, replaceable by the app.**

- About 12 strings collected into one English table per platform, with the same keys on all three (a test checks). An app passes its own: `strings={{ loading: "Chargement…" }}` on the web, `.omniStrings(…)` on iOS, `strings =` on Android. A missing or unknown key falls back to English.
- **Safe by construction** (the owner asked whether this could carry injected instructions): the words come only from the app's code, never from the stream; they're never sent to the model or the server; they're shown as plain text on every platform (`Text(verbatim:)` on iOS, which otherwise renders Markdown); placeholders such as `{value}` are replaced in one plain pass, never through formatting functions like `String.format`, whose `%` codes can crash an app; and a value containing `{max}` isn't expanded again. Tests feed hostile strings (markup, Markdown links, `%@` and `%d`, `{max}` inside a value, very long text) on all three platforms.
- **A blocked action** shows a plain sentence from the table ("This can't be sent. Check the details and try again."); the developer's detail goes only to `onEvent`.

**4. Spec.** Section 8 gains: the app, never the stream, sets the theme; the renderer's own words are the app's to replace and are shown as plain text; the default themes meet the contrast rules. Section 11 notes that neither can be reached from the stream.

**Not in this step, until there is demand:** a theming setting on iOS and Android (`OmniTheme`); built-in translations; right-to-left layouts; telling the model the person's language; styling per component or per screen.

## Decisions: pros, cons and trade-offs

**1. Leaner theming: web brand settings and dark mode; iOS and Android only swap their fixed colours** (owner's choice).
- *Pros:* about half the work; fixes what a developer notices first (the web: playground, npm, dark-mode apps); no new mobile settings to keep stable.
- *Cons:* iPhone apps can't fully rebrand Omni-IR screens yet (font, card background, radius stay iOS defaults); branding works differently per platform (CSS variables, Material theme, `.tint`).
- *Trade-off:* end users see practically no difference on Android, and a native look on iPhone; the token names are fixed now, so a full mobile setting later is a pure addition.

**2. English only, with words the app can replace** (owner's choice, option B).
- *Pros:* about a quarter of the translation work and no upkeep; a non-English app isn't blocked; adding a language later is just another table.
- *Cons:* a non-English app writes its own ~12 strings.
- *Alternatives:* fixed English (no work, but other languages are stuck and the strings stay scattered); seven languages (free to write, but upkeep for every new string and review risk, before anyone has adopted Omni-IR).

**3. A small token set (about 20), written once and generated into Swift and Kotlin** (as recommended).
- *Pros:* easy to keep identical; an app rebrands with a few values; every pair can be contrast-tested; the generator pattern already exists.
- *Cons:* less control than per-component settings; one more generated file per platform.
- *Trade-off:* adding a token later breaks no one; removing one would.

**4. Web dark theme: light by default, `theme="system"` to follow the device** (as recommended).
- *Pros:* nothing changes for apps already shipping; one prop to opt in.
- *Cons:* apps that want dark mode have to ask for it.
- *Trade-off:* revisit the default at 1.0, when breaking changes are expected anyway.

**5. Blocked actions show a plain sentence, details to developers only** (as recommended).
- *Pros:* a clear sentence instead of `amount: Too small…`; the detail still reaches `onEvent` and the logs.
- *Cons:* the person no longer sees which field was wrong.
- *Trade-off:* the renderer can't word each app's own validation messages; apps can show field-level help with their own components.

## Task checklist

Work on branch `wip/themes`. Each part starts with failing tests (constraint 4).

**A. Tokens** *(tests first)*
- [x] A.1 The token list with light and dark defaults; `conformance/theme.json` exported and checked for staleness; generated into Swift and Kotlin
- [x] A.2 Contrast tests for every pair, light and dark

**B. Web** *(tests first)*
- [x] B.1 `omni.css` on CSS variables, light values identical to today's look
- [x] B.2 Dark values, `theme="light" | "dark" | "system"` on `OmniRenderer`, dark chart colours
- [x] B.3 Direction-neutral CSS
- [x] B.4 The playground's preview follows its theme

**C. iOS and Android**
- [x] C.1 The fixed colours from the shared defaults (version notice, charts)

**D. The renderer's own words** *(tests first)*
- [x] D.1 One English table per platform, the same keys (a test checks); apps replace words (`strings`, `.omniStrings`, `strings =`), English fallback
- [x] D.2 Plain text everywhere, one-pass placeholders, no format functions; hostile-string tests on all three platforms
- [x] D.3 Blocked actions show the plain sentence; details to `onEvent` only

**E. Spec and docs**
- [ ] E.1 SPEC.md sections 8 and 11; a "Themes and wording" guide; CHANGELOG

**F. Review** *(checkpoint: you review)*
- [ ] F.1 A review page: screens light and dark on the web, a rebranded screen, the same screens on iPhone and Android, the contrast results, replaced words
- [ ] F.2 Merge with your approval
- [ ] F.3 `v0.7.0` release: a separate go-ahead from you
