# Omni-IR — Step 11: charts

Goal: close the largest gap left by the format comparison (docs/COMPARISON.md). Two of the four OpenUI scenarios Omni-IR still can't draw need charts, and dashboards are central to the agency work. Add bar, line and pie charts to the protocol and all three renderers, keeping Omni-IR's rules: data only from the stream, every visual choice made by the renderer.

Status: **APPROVED 2026-10-04** with the recommendations: bar, line and pie charts with Series and Slice; Android charts drawn on a Compose Canvas (no library); no `$state` in chart data for now; a screenshot review on all three platforms before merging. Added at the owner's request: conformance cases proving style, colour, animation and tooltip props are rejected, and a styling probe in the model check.

## Proposal

Five new components: three charts and the two kinds of data they hold. Each series or slice is its own line, like a TableRow, so a chart fills in as the stream arrives and one bad line doesn't lose the chart.

**BarChart and LineChart, with Series: values across categories or over time.**
```
sales = BarChart("Sales by month", ["Jul", "Aug", "Sep"], [online, store], format="currency")
online = Series("Online", [1200, 1500, 1800])
store = Series("In store", [900, 1100, 950])

visits = LineChart("Weekly visitors", ["W1", "W2", "W3", "W4"], [users])
users = Series("Visitors", [3200, 3550, 3400, 4100])
```
- The first argument is a title (required): it names the chart for everyone, including screen readers.
- Labels go along the bottom (1–24 of them). Each Series has a name and one number per label.
- Up to 6 series in one chart. With 2 or more, a legend shows each series' name.
- An optional `format` (`"number"`, `"currency"` with `currency=`, or `"percent"`) sets how values and the axis are written.

**PieChart, with Slice: parts of a whole.**
```
channels = PieChart("Where orders come from", [web, app, phone])
web = Slice("Website", 62)
app = Slice("App", 31)
phone = Slice("Phone", 7)
```
- Up to 8 slices, each a name and a value of 0 or more. A legend names every slice and its share.

**What stays the same:**
- The model sends numbers only. It can't choose colours, sizes, axes or styles: each renderer draws the charts with its own fixed palette, checked for colour blindness, in light and dark.
- No `$state` in chart data for now: a chart shows the numbers the stream wrote. Live data is a later question.
- Charts never call the backend.
- **Data, not pixels:** values on hover, tooltips, the legend and any animation are drawn by the renderer from the data. The model never writes tooltip text, colours or styles. Conformance cases prove that chart lines with props such as `color`, `style`, `animation` or `tooltip` are rejected on every platform, and the model check includes a probe asking for exactly that.

**New document rules (and issue codes, like `table_mismatch`):**
- A BarChart or LineChart holds only Series, a PieChart only Slices, and each item sits only in its kind of chart.
- A Series has exactly one value per label of its chart.

## What it would cover

| OpenUI scenario | Today | After this step |
|---|---|---|
| simple-table, contact-form, settings-panel | ✓ | ✓ |
| chart-with-data | ✕ needs a bar chart | ✓ |
| dashboard | ✕ needs bar, line and pie charts | ✓ |
| pricing-page | ✕ needs Markdown and an accordion | ✕ unchanged |
| e-commerce-product | ✕ needs an image gallery, Markdown and radio buttons | ✕ unchanged |

From 3 of 7 to 5 of 7. The remaining two need Markdown, which Omni-IR deliberately never supports, plus an accordion, an image gallery and radio buttons.

## Facts that shape this

- **Each platform draws charts differently:**
  - **Web:** React draws the charts itself as SVG. That avoids a charting library, so the npm packages stay small (core 25 KB, react 19 KB today).
  - **iOS:** SwiftUI has Apple's Swift Charts built in (iOS 16+; the package needs iOS 17). It comes with good accessibility, including audio graphs.
  - **Android:** Compose has no built-in charts. They'd be drawn on a Canvas, with semantics added for TalkBack, or come from a library (question 2).
- **Accessibility:**
  - Every chart has a title.
  - Screen readers get each value. On the web, a hidden table holds the same data; on iOS and Android, each bar, point or slice is labelled.
  - Colour is never the only way to tell series apart: there's a legend, a different line style per series on line charts, and values on hover or tap.
- **Older parsers reject the new components** (`unknown_component`), as with Step 10. They'd ship in `v0.3.0`, only with your go-ahead.
- **Tests come first:** failing parser and schema tests are written before the implementation (CLAUDE.md constraint 4).
- **Cost: free.** Mock data, the existing tests and CI. The model check uses your Claude.ai chat.

## Questions for you (with recommendations)

1. **Which charts?**
   - *Recommended:* bar, line and pie, with Series and Slice. They cover both OpenUI chart scenarios and most dashboards.
   - Area, radar and scatter charts can follow later if needed.
2. **Android: draw the charts ourselves, or use a library?**
   - *Recommended:* draw them ourselves on a Compose Canvas. It's more work up front, but it means no third-party dependency, full control of accessibility, and the same look as web and iOS.
   - The alternative is a library such as Vico: faster to build, but a dependency we'd have to keep up to date.
3. **Live data:** should chart values be able to come from `$state`, which is what live dashboards would need?
   - *Recommended:* not in this step. Charts show the numbers the stream wrote. Live data belongs with real backend tools, which is a later roadmap item.
4. **Review:**
   - *Recommended:* the same as Step 10. You review web, iPhone and Android screenshots, light and dark, on a review page before anything merges.

## Task checklist

**A. Protocol, tests first** *(checkpoint: failing tests)*
- [ ] A.1 Failing tests for each component's props and limits, the parent rules, values per label, slice values of 0 or more, and rejection of styling props (`color`, `style`, `animation`, `tooltip`)
- [ ] A.2 Add the components and rules to `schema.ts`. Regenerate `schema.json`, SPEC.md, the conformance cases, and the Swift and Kotlin catalogs. Write the hand-written SPEC rules and conformance cases, including a case where styling props on charts are rejected
- [ ] A.3 The Swift and Kotlin parsers implement the new rules and pass every conformance case

**B. Renderers**
- [ ] B.1 React: SVG bar, line and pie charts with axes, a legend, values on hover and focus, a hidden data table, and a fixed palette checked for colour blindness in light and dark
- [ ] B.2 SwiftUI: Swift Charts with the same palette and accessibility labels
- [ ] B.3 Compose: Canvas drawing with the same palette, plus TalkBack semantics

**C. Model and examples**
- [ ] C.1 System prompt: the chart components and when to use each one
- [ ] C.2 Example screens: a sales dashboard (bar and line) and an order breakdown (pie), in the mock model, the playground and both demo apps
- [ ] C.3 Free model check: chart requests, plus a probe asking for red animated bars with custom tooltips (a good reply draws the plain chart and says styling isn't available), run in your Claude.ai chat

**D. Review** *(checkpoint: you review)*
- [ ] D.1 Web (live), iPhone and Android screenshots on a review page

**E. After your approval**
- [ ] E.1 Merge; README component list and CHANGELOG updated
- [ ] E.2 Re-run the comparison's coverage (expected: 5 of OpenUI's 7 scenarios)
- [ ] E.3 `v0.3.0` release: a separate go-ahead from you

## What I needed from you

Answered 2026-10-04: "go ahead with the charts plan", with the recommendations.
