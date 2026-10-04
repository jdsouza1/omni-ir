# Omni-IR — Step 10: catalog expansion

Goal: close the biggest gap the format comparison found (docs/COMPARISON.md): Omni-IR's 15 components can draw none of OpenUI's seven published scenarios, because they need dropdowns, tables, tabs, switches or notices. Add the components that fill the most of that gap, on all three renderers, without loosening any of Omni-IR's rules.

Status: **APPROVED 2026-10-04** with the recommendations: all five components (Select, Switch, Table/TableRow, Tabs/Tab, Notice), one line per table row, charts left for their own step, and a screenshot review on all three platforms before merging.

## Proposal

Five new components, in two pairs that follow the List/ListItem pattern plus three single components. Every example is real flat Omni-IR:

**Select: pick one option from a list (a dropdown).**
```
$size = ""
size = Select($size, label="Size", options=["Small", "Medium", "Large"], placeholder="Choose a size")
```
- It edits a text `$key`, like Input. The selected option's text is the value, and `""` means nothing is chosen yet.
- `options` is 1–50 strings. A state value that isn't one of the options shows as nothing chosen (no error), so a screen never breaks over it.

**Switch: an on/off setting.**
```
$news = false
news = Switch($news, label="Email me order updates")
```
- It edits a true/false `$key`. Settings screens need it, and today there's no way to show a toggle.

**Table and TableRow: rows of data under column headings.**
```
plans = Table(["Plan", "Price", "Projects"], [basic, pro])
basic = TableRow(["Basic", "$12", 3])
pro = TableRow(["Pro", "$29", "Unlimited"])
```
- Each row is its own line, so a long table streams row by row, and one bad row is reported and skipped instead of losing the whole table.
- Cells are text or numbers (numbers are right-aligned), and a row must have as many cells as there are columns.
- Up to 8 columns and 200 rows (the existing children limit).
- A Table holds only TableRows, and a TableRow sits only in a Table, as with List and ListItem.

**Tabs and Tab: switch between sections of one screen.**
```
tabs = Tabs([profileTab, alertsTab])
profileTab = Tab("Profile", [name, bio])
alertsTab = Tab("Notifications", [news])
```
- The first tab is open to begin with. Which tab is open is the viewer's own choice, like scrolling: it isn't `$state`, and the model can't change it.
- Tabs hold only Tabs, and a Tab sits only in Tabs.

**Notice: a highlighted message (info, success, warning, danger).**
```
warn = Notice("Payments are paused while we update our systems.", tone="warning", title="Heads up")
```
- Text only. It's the safe stand-in for OpenUI's Callout and TextCallout, and for alerts and errors generally.

**Unchanged:**
- None of these call the backend. Like Input, Select and Switch only edit state, and their values reach a tool through McpMutation params, checked as today.
- No new styling, markup or URLs.
- Charts stay out of this step (see the questions).

## What it would cover

Re-running the comparison's coverage check with these components:

| OpenUI scenario | Today | After this step |
|---|---|---|
| simple-table | ✕ needs Table | ✓ |
| contact-form | ✕ needs Select | ✓ |
| settings-panel | ✕ needs Tabs, switches, a notice | ✓ |
| chart-with-data | ✕ needs a chart | ✕ needs a chart |
| dashboard | ✕ needs charts, Table | ✕ needs charts |
| pricing-page | ✕ needs Markdown, an accordion, Table | ✕ needs Markdown and an accordion |
| e-commerce-product | ✕ needs an image gallery, Markdown, radio buttons, Select, Table | ✕ needs an image gallery and Markdown |

From 0 of 7 to 3 of 7. The rest mostly need charts, or Markdown. Markdown is deliberately never supported: the model may not send markup.

## Facts that shape this

- **Every renderer changes together.** Each component is added once in `packages/core/src/schema.ts`. The existing generators then produce `schema.json`, the Swift and Kotlin catalogs, SPEC.md's tables, the per-component conformance cases and the system prompt. Each renderer then draws them:
  - React: native `<select>`, a switch button, a real `<table>` that scrolls sideways on phones, and an accessible tab list.
  - SwiftUI: `Picker`, `Toggle`, `Grid`, and a segmented control.
  - Compose: `ExposedDropdownMenuBox`, `Switch`, a scrolling grid, and `TabRow`.
- **New document rules need new issue codes and conformance cases,** like `list_mismatch`: a TableRow outside a Table or a wrong cell count, a Tab outside Tabs, and Select or Switch bound to the wrong kind of state. The TypeScript, Swift and Kotlin parsers all implement them and must pass the new cases.
- **Older parsers reject the new components** (`unknown_component`). As with the multi-line Input, a server and its apps should use the same version. These ship in `v0.2.0` together with the multi-line Input, and only with your go-ahead.
- **Tests first** (CLAUDE.md constraint 4): failing parser and schema tests come before the implementation.
- **Cost: free.** Mock data, the existing tests and CI. The model check and the comparison re-run use your Claude.ai chats, as before.

## Questions for you (with recommendations)

1. **Which components?** *Recommended:* all five above (Select, Switch, Table, Tabs, Notice). Select, Table and Tabs are the gaps the comparison found. Switch and Notice are small and complete the settings-panel scenario.
2. **Table rows: one line per row, or the whole table in one line?** *Recommended:* one line per row (TableRow), as shown. It streams row by row, keeps lines short, and a bad row doesn't lose the table. It costs a few more tokens per row.
3. **Charts?** *Recommended:* not in this step. A chart is a big build on three platforms: Swift Charts on iOS, but no built-in chart in Compose, and SVG on the web. It would get its own plan (Step 11) once these are done.
4. **Review:** *recommended* the same as for the multi-line Input. You review web, iPhone and Android screenshots (from the existing CI workflows) on a review page before anything merges.

## Task checklist

**A. Protocol, tests first** *(checkpoint: failing tests)*
- [ ] A.1 Failing tests for each component's props and limits, the new parent/child rules, cell counts and state types
- [ ] A.2 Add the five components and their rules to `schema.ts`. Regenerate `schema.json`, SPEC.md, the conformance cases, and the Swift and Kotlin catalogs. Write the hand-written SPEC rules and new conformance cases for each new rule.
- [ ] A.3 Swift and Kotlin parsers: implement the new rules; all conformance cases pass, fed whole and in chunks

**B. Renderers**
- [ ] B.1 React: Select, Switch, Table (scrolls sideways on phones), Tabs (keyboard arrows, ARIA tab pattern), Notice. Tests for state editing and tab switching.
- [ ] B.2 SwiftUI: the same five; no forced unwraps (the existing test enforces this)
- [ ] B.3 Compose: the same five; no `!!`

**C. Model and examples**
- [ ] C.1 System prompt: the new components and when to use them; prompt test updated
- [ ] C.2 Fixtures and the mock model: a settings screen (Tabs, Switch, Notice), an order history (Table) and a form with a Select; playground examples
- [ ] C.3 Free model check: a few new requests that need these components, run in your Claude.ai chat

**D. Review** *(checkpoint: you review)*
- [ ] D.1 Web, iPhone and Android screenshots of the new fixtures from the CI workflows, on a review page

**E. After your approval**
- [ ] E.1 Merge; landing page and README component lists updated
- [ ] E.2 Re-run the format comparison (coverage, size and reliability) with the new components, as recorded in PLAN-COMPARISON.md's decision
- [ ] E.3 `v0.2.0` release (npm, the first Swift tag): a separate go-ahead from you

## What I needed from you

Answered 2026-10-04: "go with the recommendations".
