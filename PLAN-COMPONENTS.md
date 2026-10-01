# Omni-IR — Step 4: New components

Goal: add the components the landing page's original design needs (a photo, a star rating, dates, a list of items, chat messages) without weakening any security rule, then restore the landing page examples to that design. Costs nothing.

Status: **DRAFT, awaiting decisions** (questions at the end).

## Proposed components

| Component | Syntax (proposal) | Kind | Notes |
|---|---|---|---|
| **Image** | `photo = Image(asset="cabin-pines", alt="A wooden cabin among pine trees")` | display | Picks a picture **the app registered**, by name; never a URL (see Q1). `alt` required. |
| **Rating** | `stars = Rating(4.96, max=5)` | display | Shows a score as stars plus the number. Display only. |
| **DateInput** | `checkIn = DateInput($checkIn, label="Check-in")` | input | Edits a `$state` holding `"YYYY-MM-DD"` or `""`, like Input. A range is two DateInputs in a Stack. Optional `min` / `max`. |
| **List** + **ListItem** | `items = List([shirt, tote])` and `shirt = ListItem("Linen overshirt", detail="Sand · M", trailing="$128.00", image="shirt")` | display | Flat like everything else: List lists item ids. No loops or data binding (Omni-IR has no expressions). |
| **Message** | `q = Message("Any quiet beaches near Lisbon?", from="user")` | display | A chat bubble; `from` is `"user"` or `"assistant"`. A conversation is a Stack of Messages. |

## Rules that stay fixed
- Flat syntax, fixed catalog, no styling from the model, text always rendered as text.
- DateInput follows the Input rules (R1): typing is local; values reach the backend only through McpMutation params, validated by the tool's schema.
- The parser, prompt, spec tables and conformance coverage pick up new components from the schema automatically, and the existing tests fail if anything is left out.

## Task checklist
- [ ] **A. Image asset registry:** `app/assets.ts`, a name → `{ src, width, height }` map supplied by the app, like the tool registry. The schema rejects unknown asset names (new issue code `unknown_asset`); the renderer only ever uses `src` from the registry.
- [ ] **B. Schema:** the five components in `engine/schema.ts`, with tests for valid and invalid lines (an Image with a URL, a Rating above `max`, a DateInput bound to a number, a ListItem used outside a List, and so on).
- [ ] **C. Catalog and renderer:** React components with neutral styles in `omni.css`; DateInput wired like Input; `data-node-id` on each; render and interaction tests.
- [ ] **D. Spec and conformance:** new rules in SPEC.md section 5 and conformance cases for each; regenerate the spec and prompt.
- [ ] **E. Fixtures and mock model:** rewrite `fixtures/landing/*.omni` with the new components; update `landing.json`.
- [ ] **F. Landing page:** regenerate the examples (`npm run landing:examples`) and rebuild the three cards to show the photo, rating, date fields, item list and chat bubbles again.
- [ ] **G. Check:** full suite, playground in the browser, landing page locally before publishing.

## Questions
1. **Image source.** *Recommended:* images only from an **app-registered asset list**, chosen by name. A model that can write any URL could load tracking pixels, leak data through the URL (for example after a prompt injection), or show any picture from the web. Alternatives: (b) URLs only from hosts the app allowlists; (c) any HTTPS URL (not recommended).
2. **Dates:** single `DateInput`, with a range made of two (recommended), or a dedicated `DateRangeInput`?
3. **Names:** OK with `Image`, `Rating`, `DateInput`, `List`, `ListItem`, `Message`?
