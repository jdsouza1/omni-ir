# Omni-IR compared with similar formats

Step 9 of the roadmap ([PLAN-COMPARISON.md](../PLAN-COMPARISON.md)), measured on 2026-10-01. How Omni-IR compares with other ways a model can describe a screen: size, streaming, what each format lets a model do, and how reliably a model writes it. Everything here except the reliability runs is reproduced offline by `npm run bench`; the tables between `generated` markers are written by that command, and a test fails if they are stale. Method details are in [benchmarks/README.md](../benchmarks/README.md).

**Status: draft for the owner's review.** Nothing from this page goes on the landing page or README until it has been reviewed (task D.2).

## Summary

- **Size.** Omni-IR and OpenUI Lang are in the same class, and OpenUI Lang is the more compact: 4% fewer tokens on the model-check screens and 10% fewer on OpenUI's own scenarios. Both are well below the JSON formats on the same screens: Omni-IR uses 39% fewer tokens than A2UI (55% fewer than json-render, 50% fewer than HTML with Tailwind, 18% fewer than React JSX). OpenUI Lang's lead comes from positional arguments and components written inline; Omni-IR names every optional prop and puts every component on its own line.
- **Streaming.** The line formats (Omni-IR, OpenUI Lang) can draw their first content after about 30–40 tokens. JSON patches (json-render) and per-component A2UI messages stream too, but need about three times as many tokens to get there (json-render 2.6–2.8×, A2UI 3.6–3.8×). A2UI with all components in one message, as most of its examples are written, and React JSX, which must compile, show nothing until the reply is complete.
- **Coverage.** The catalog was the largest gap. Before Step 10, Omni-IR's 15 components could draw none of OpenUI's seven scenarios; with Select, Switch, Table, Tabs and Notice added (22 components, 2026-10-04) it draws three of them (the simple table, the contact form and the settings panel), and with bar, line and pie charts (Step 11, 27 components, 2026-10-05) five, adding the chart and the dashboard. The other two need Markdown, an accordion, an image gallery or radio buttons. OpenUI's 53-component library draws five of the nine model-check screens unchanged.
- **What differs is control, not syntax.** Omni-IR gives the model the least room of the formats compared: no logic in the stream, pictures only by name from the app's registry, and every action that changes data wrapped in McpMutation, naming a registered tool, with params checked against that tool's schema. It also has a 96-case conformance suite (plus 21 transport cases) and three native renderers that pass it. The others are more expressive (OpenUI Lang has expressions and live queries; A2UI and json-render have functions and conditions), which buys power at the cost of predictability.
- **Reliability: a tie on validity, a difference in behaviour.** In fresh Claude.ai chats (Opus 5.5, 2026-10-04), both formats were written validly on the first try for all nine requests, each checked by its own parser. The differences were in what the model did: with Omni-IR it left the account-deletion button unwired and said deletion isn't available here; with OpenUI Lang it wired a working-looking "Permanently delete my account" button to an invented action, and it put five made-up image URLs into the screens.

## Method

**Same screen, different syntax.** Every screen is read into one structure and written into each format by a script, keeping the same components and props; only the syntax changes. This is how OpenUI's own benchmark works (it writes its components into json-render and YAML), so these numbers line up with its published table. Size here compares syntax, not component libraries; which library can draw which screen is the coverage table below.

**Screens.** Two sets: the nine replies from the first model check (written by Claude in Omni-IR from the system prompt alone), and the seven scenarios OpenUI publishes with its benchmark (written in OpenUI Lang). Each set is measured in every format, so Omni-IR is also measured on someone else's examples.

**Formats**, each in its own documented idiom and latest stable version: Omni-IR (this spec); OpenUI Lang v0.5 (positional arguments, `$variables`, `Mutation` run through `Action([@Run(...)])`); A2UI v0.9.1 (JSON Lines messages, measured both with all components in one message and with one message per component); json-render (JSON Patch lines); HTML with Tailwind classes, model-check set only; and React JSX against the same component library.

**Tokens** are counted offline with `tiktoken`'s GPT-5 encoding, the counter OpenUI's benchmark uses. Claude's own tokenizer would give different absolute numbers; counting with it needs a paid API call, so it isn't used.

**Checks on the converters:**
- The Omni-IR and OpenUI Lang outputs read back as the same screens, and the Omni-IR outputs of the model-check screens are valid with the real parser, tools and assets.
- Reading OpenUI's scenarios and writing them as OpenUI's own converter does reproduces its published json-render files byte for byte.
- OpenUI's own parser (`@openuidev/lang-core` 0.3.0) accepts all sixteen OpenUI Lang outputs with no errors, unresolved references or orphaned statements.
- Every A2UI message validates against A2UI's published message schema.

## Size

Tokens per screen. Model-check screens:

<!-- generated:size-omni -->
| Screen | Omni-IR | OpenUI Lang | A2UI v0.9 | A2UI v0.9 (one message per component) | json-render | HTML + Tailwind | React JSX |
|---|---:|---:|---:|---:|---:|---:|---:|
| booking | 273 | 260 | 436 | 732 | 609 | 541 | 341 |
| bag | 237 | 221 | 394 | 646 | 541 | 551 | 296 |
| assistant | 210 | 203 | 339 | 508 | 423 | 394 | 261 |
| sign-in | 148 | 146 | 268 | 399 | 321 | 278 | 203 |
| order | 236 | 228 | 360 | 609 | 511 | 370 | 263 |
| support | 204 | 200 | 342 | 553 | 463 | 422 | 268 |
| outside-catalog | 179 | 179 | 323 | 619 | 485 | 451 | 212 |
| styling | 198 | 191 | 347 | 589 | 478 | 357 | 253 |
| no-tool | 333 | 316 | 499 | 830 | 676 | 655 | 371 |
| **Total** | **2,018** | **1,944** | **3,308** | **5,485** | **4,507** | **4,019** | **2,468** |
| Relative to Omni-IR | 1.00× | 0.96× | 1.64× | 2.72× | 2.23× | 1.99× | 1.22× |
<!-- /generated:size-omni -->

OpenUI's scenarios (HTML is left out: charts and tables have no fair hand-written template):

<!-- generated:size-openui -->
| Screen | Omni-IR | OpenUI Lang | A2UI v0.9 | A2UI v0.9 (one message per component) | json-render | React JSX |
|---|---:|---:|---:|---:|---:|---:|
| simple-table | 169 | 146 | 253 | 383 | 318 | 191 |
| chart-with-data | 247 | 231 | 369 | 598 | 481 | 278 |
| contact-form | 396 | 294 | 596 | 1,031 | 837 | 410 |
| dashboard | 1,280 | 1,224 | 1,576 | 2,531 | 2,190 | 1,166 |
| pricing-page | 1,314 | 1,181 | 1,698 | 2,761 | 2,350 | 1,286 |
| settings-panel | 596 | 540 | 851 | 1,409 | 1,163 | 624 |
| e-commerce-product | 1,319 | 1,166 | 1,687 | 2,780 | 2,330 | 1,291 |
| **Total** | **5,321** | **4,782** | **7,030** | **11,493** | **9,669** | **5,246** |
| Relative to Omni-IR | 1.00× | 0.90× | 1.32× | 2.16× | 1.82× | 0.99× |
<!-- /generated:size-openui -->

Omni-IR is largest relative to OpenUI Lang on `contact-form` (35% more). There, OpenUI Lang writes each form field as one line, `FormControl("Name", Input("name", …))`, while Omni-IR needs two: Omni-IR doesn't allow a component inside another component's arguments.

### Checked against OpenUI's published numbers

<!-- generated:calibration -->
| Scenario | OpenUI Lang (published) | as read and rewritten here | json-render (published) | rewritten here in OpenUI's style | C1 JSON (published / counted here) | YAML (published / counted here) |
|---|---:|---:|---:|---:|---:|---:|
| simple-table | 148 | 146 | 340 | 340 | 357 / 322 | 316 / 317 |
| chart-with-data | 231 | 231 | 520 | 520 | 516 / 498 | 464 / 465 |
| contact-form | 294 | 294 | 893 | 893 | 849 / 824 | 762 / 763 |
| dashboard | 1,226 | 1,224 | 2,247 | 2,247 | 2,261 / 2,182 | 2,128 / 2,129 |
| pricing-page | 1,195 | 1,181 | 2,487 | 2,487 | 2,379 / 2,285 | 2,230 / 2,231 |
| settings-panel | 540 | 540 | 1,244 | 1,244 | 1,205 / 1,195 | 1,077 / 1,078 |
| e-commerce-product | 1,166 | 1,166 | 2,449 | 2,449 | 2,381 / 2,344 | 2,145 / 2,146 |
<!-- /generated:calibration -->

- **json-render:** identical, file for file.
- **OpenUI Lang:** OpenUI's files spread some long statements over several lines; rewritten one statement per line, three of them are 2–14 tokens shorter.
- **C1 JSON:** counted here, it comes out 1–8% below OpenUI's table, although the files and the table were last changed in the same commit. These pages use the counts made here.
- **YAML:** one token more everywhere, from the files' final newline.

## Streaming

When can the first content be drawn, and when can half of it? This is measured in tokens, with the share of the whole reply in brackets, averaged over each set. A component counts as drawable once it and every component above it have fully arrived: a complete line for Omni-IR, OpenUI Lang and json-render; a complete message for A2UI; its own text for HTML; and the whole module for JSX. Layout containers don't count as content.

<!-- generated:streaming -->
| Format | Model-check screens: first content | half the content | OpenUI's scenarios: first content | half the content |
|---|---:|---:|---:|---:|
| Omni-IR | 32 (15%) | 122 (54%) | 39 (7%) | 402 (56%) |
| OpenUI Lang | 31 (15%) | 118 (54%) | 35 (7%) | 313 (47%) |
| A2UI v0.9 | 368 (100%) | 368 (100%) | 1004 (100%) | 1004 (100%) |
| A2UI v0.9 (one message per component) | 122 (21%) | 357 (58%) | 140 (13%) | 911 (58%) |
| json-render | 88 (18%) | 285 (57%) | 102 (11%) | 755 (57%) |
| HTML + Tailwind | 64 (15%) | 241 (53%) | – | – |
| React JSX | 274 (100%) | 274 (100%) | 749 (100%) | 749 (100%) |
<!-- /generated:streaming -->

On OpenUI's scenarios OpenUI Lang reaches half of the content sooner than Omni-IR (313 tokens against 402): a component written inline arrives with its parent's line, while Omni-IR sends it on a line of its own. OpenUI's renderer also draws statements that are still arriving. This measurement waits for complete statements in every format, so OpenUI Lang's real numbers may be a little earlier still.

## Coverage: which library can draw which screen

These are components with no counterpart in the other library. Close counterparts are not listed: TextContent and Text or Heading, Separator and Divider, Tag and Badge, DatePicker and DateInput, TextArea and Input with `lines`, and a form's controls and an Input in a Stack.

<!-- generated:coverage -->
| Screen | Set | Components | No counterpart in the other library |
|---|---|---:|---|
| booking | model check | 14 | Rating |
| bag | model check | 12 | List, ListItem |
| assistant | model check | 9 | Message |
| sign-in | model check | 7 | none: drawable there too |
| order | model check | 13 | none: drawable there too |
| support | model check | 10 | none: drawable there too |
| outside-catalog | model check | 14 | Skeleton |
| styling | model check | 11 | none: drawable there too |
| no-tool | model check | 15 | none: drawable there too |
| simple-table | OpenUI | 7 | none: drawable there too |
| chart-with-data | OpenUI | 11 | none: drawable there too |
| contact-form | OpenUI | 21 | none: drawable there too |
| dashboard | OpenUI | 47 | none: drawable there too |
| pricing-page | OpenUI | 50 | MarkDownRenderer, Accordion |
| settings-panel | OpenUI | 27 | none: drawable there too |
| e-commerce-product | OpenUI | 49 | ImageGallery, RadioGroup, MarkDownRenderer |
<!-- /generated:coverage -->

OpenUI's benchmark library has 53 components; Omni-IR's catalog has 27. Step 10 (PLAN-CATALOG.md) added Select, Switch, Table and TableRow, Tabs and Tab, and Notice, taking Omni-IR from none of OpenUI's seven scenarios to three; Step 11 (PLAN-CHARTS.md) added BarChart, LineChart, PieChart, Series and Slice, taking it to five. What remains is an accordion, an image gallery and radio buttons, plus Markdown, which Omni-IR deliberately never supports because it would let the model send markup.

## What each format lets a model do

Every cell names its source: a file in this repo, or a pinned copy under `benchmarks/sources/`. MCP-UI (HTML, URLs or remote-DOM scripts in sandboxed frames) and Open-JSON-UI are left out of the table; see the plan's sources.

<!-- generated:capabilities -->
| | Omni-IR | OpenUI Lang | A2UI v0.9 | json-render | HTML + Tailwind | React JSX |
|---|---|---|---|---|---|---|
| **Who defines the components** | A fixed catalog in the spec: 27 components plus McpMutation <sub>SPEC.md §6</sub> | The app's library (Zod schemas); 53 components in its benchmark library <sub>sources/openui/specification-v05.mdx</sub> | The catalog named in createSurface: the basic catalog or the app's own <sub>sources/a2ui/a2ui_protocol.md</sub> | The app's catalog (Zod schemas) <sub>sources/json-render/README.md</sub> | Any element | Any code |
| **Markup or scripts from the model** | No. Text is always drawn as text <sub>SPEC.md §8, §11</sub> | No HTML; the default library renders Markdown and code blocks <sub>sources/openui/system-prompt.txt</sub> | No; the basic Text allows simple Markdown without HTML, images or links <sub>sources/a2ui/catalog.json</sub> | No; catalog components only <sub>sources/json-render/README.md</sub> | Yes: needs sanitizing | Yes: runs as code, needs a sandbox |
| **Styling from the model** | No: only the catalog's variants and tones <sub>SPEC.md §6</sub> | Variants and sizes from the library <sub>sources/openui/system-prompt.txt</sub> | Variants, plus a theme colour (primaryColor) in createSurface <sub>sources/a2ui/catalog.json</sub> | Whatever the catalog's props allow <sub>sources/json-render/README.md</sub> | Any class or style | Any class or style |
| **Pictures** | Names from the app's registry, never URLs <sub>SPEC.md §6 (Image)</sub> | Any URL (Image, ImageGallery) <sub>sources/openui/system-prompt.txt</sub> | Any URL (Image, Video, AudioPlayer) <sub>sources/a2ui/catalog.json</sub> | Whatever the catalog allows <sub>sources/json-render/README.md</sub> | Any URL | Any URL |
| **Actions that change data** | Must be wrapped in McpMutation; the tool must be in the app's registry; params checked against the tool's schema by the parser, the browser and the server <sub>SPEC.md §6, §9</sub> | Mutation("tool", args) run by a button; the prompt lists the tools; checking a call is left to the app's tool provider <sub>sources/openui/specification-v05.mdx</sub> | A button sends an event (name and context) to the agent, which handles it <sub>sources/a2ui/a2ui_protocol.md</sub> | Named actions declared in the catalog; params are free-form <sub>sources/json-render/README.md</sub> | Whatever the page's script does | Whatever the code does |
| **Logic in the stream** | None: values, references and $state only <sub>SPEC.md §4</sub> | Expressions, ternaries, built-ins such as @Each and @Filter, live Query() <sub>sources/openui/specification-v05.mdx</sub> | Function calls (formatString, and/or/not, checks) <sub>sources/a2ui/catalog.json</sub> | $cond, $template, $computed, visibility conditions, watchers <sub>sources/json-render/README.md</sub> | Scripts | Any |
| **When drawing can start** | After each complete line <sub>SPEC.md §3</sub> | Re-parsed on every chunk; references resolve as they arrive <sub>sources/openui/specification-v05.mdx</sub> | Once the root component's message has arrived <sub>sources/a2ui/a2ui_protocol.md</sub> | After each patch line <sub>sources/json-render/README.md</sub> | As markup arrives | After the whole module compiles |
| **Written spec** | Yes: grammar, document rules, issue codes, renderer rules <sub>SPEC.md</sub> | Yes: language spec v0.5 <sub>sources/openui/specification-v05.mdx</sub> | Yes: versioned spec with JSON Schemas <sub>sources/a2ui/a2ui_protocol.md</sub> | Documentation and types <sub>sources/json-render/README.md</sub> | HTML standard | JavaScript / React |
| **Shared tests for other implementations** | 85 language-neutral conformance cases <sub>conformance/</sub> | None published that we found | Spec test cases (specification/v0_9/test) <sub>a2ui-project/a2ui</sub> | None published that we found | Not applicable | Not applicable |
| **Renderers** | React, SwiftUI, Jetpack Compose: all three pass the conformance cases <sub>packages/, swift/, android/</sub> | React, Vue, Svelte, Angular <sub>thesysdev/openui packages/</sub> | Lit, Angular, React, Flutter <sub>a2ui.org</sub> | React, Vue, Svelte, Solid, React Native, and PDF, email, video and terminal <sub>sources/json-render/README.md</sub> | Browsers | React |
| **Licence** | Apache-2.0 | MIT <sub>sources/openui/LICENSE</sub> | Apache-2.0 <sub>sources/a2ui/LICENSE</sub> | Apache-2.0 <sub>sources/json-render/LICENSE</sub> | Not applicable | Not applicable |
<!-- /generated:capabilities -->

## Reliability

The same nine requests as the first model check, run on 2026-10-04 in two fresh Claude.ai chats on the owner's account (Claude Opus 5.5, the account's default; driven through the owner's browser, no API): one with Omni-IR's current system prompt, one with the system prompt OpenUI publishes with its benchmark. Every reply was checked by its own format's parser: Omni-IR's own with the app's tools and pictures, and OpenUI's `@openuidev/lang-core` 0.3.0 with its benchmark library. The replies are in [`benchmarks/reliability/2026-10-04/`](../benchmarks/reliability/2026-10-04/); a test checks that the Omni-IR ones stay valid.

| | Omni-IR | OpenUI Lang |
|---|---|---|
| Valid on the first try | **9 of 9** | **9 of 9** |
| Text outside the format (prose, code fences) | none | none |
| Tokens across the nine replies | 1,741 | 4,244 |
| Components per screen (average) | 10 | 26 |
| Picture URLs invented by the model | 0 (named from the app's registry) | 5 (Unsplash links) |
| Account deletion, with no tool for it | Button left unwired, with "Account deletion isn't available here." | "Permanently delete my account" wired to an invented `submit:deleteAccount` action |
| Red button and bold total asked for in CSS and HTML | `variant="danger"`, `tone="strong"` | `type="destructive"`, Markdown bold; it also added card number and CVC fields nobody asked for |
| Video player with a slider | A preview without a slider, saying so | A Slider (its library has one) |

What this shows:
- **Both formats are easy for a current model to write validly.** Validity alone doesn't separate them.
- **The difference is what the model is allowed to do.** OpenUI's published prompt has no tool list, so any action string is valid; nothing stopped the model wiring a permanent deletion to an action that doesn't exist. Omni-IR's registry and McpMutation rule made the model leave it unwired and say so. A prompt set up with OpenUI's tools (`Mutation`, `toolCalls`) would narrow this gap; the published benchmark prompt doesn't use them.
- **OpenUI's screens were richer** (2.4 times the tokens, about 2.6 times the components). Part of that is its larger library (tables, tabs, switches, sliders), and part is the model adding things nobody asked for, such as the payment fields.

Earlier result: Omni-IR, 9 of 9 valid with the earlier prompt ([model check, 2026-10-01](model-check-2026-10-01.md)). This run used the current prompt, and all three rules added after that check held: no repeated rating, no Skeleton standing in for a missing component, and no tool used for something it isn't for.

## Caveats

- **Sixteen screens, one tokenizer.** Absolute numbers will differ with other screens and other tokenizers. In both sets the JSON formats and HTML came out well above the two line formats, but the exact ratios differ between sets (A2UI is 1.64× Omni-IR on one and 1.32× on the other).
- **The converters are this project's own.** They follow each format's documentation, all outputs are committed under `benchmarks/out/`, and the checks above tie them to the formats' own parsers and schemas. They are still not written by the other projects. A2UI's per-component variant and the HTML templates are choices made here.
- **Each screen set favours its own library.** The model-check screens were written for Omni-IR's catalog and OpenUI's scenarios for OpenUI's library, which is why both sets are reported.
- **One reliability run per format, one model.** Nine requests each, on Claude Opus 5.5 only; other models, or more runs, could differ.
- **No existing benchmark compares these formats** on size, streaming, safety and reliability together, as far as we found on 2026-10-01 (see the plan). That isn't proof that none exists, so any public claim should be worded with care.

## Sources

- OpenUI: https://github.com/thesysdev/openui at `97e8335` (benchmark samples, `schema.json`, system prompt, language spec v0.5), MIT.
- A2UI: https://github.com/a2ui-project/a2ui at `5cd37f4` (specification v0.9.1: message schema, common types, basic catalog, protocol), Apache-2.0; renderers per https://a2ui.org/.
- json-render: https://github.com/vercel-labs/json-render at `fc2a696` (README, core types), Apache-2.0.
- tiktoken: https://github.com/openai/tiktoken (JavaScript port `tiktoken` on npm).
