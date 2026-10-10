# Omni-IR — Step 20: app-defined components

Status: **APPROVED 2026-10-10** with the recommendations (all ten decisions); timing a real model's first line is tabled by the owner. Free: no paid API; tests, demos and measurements use the mock model and token counts. Nothing here is built until you approve it.

## Goal

An app can add a component Omni-IR doesn't have (a product card, a quantity picker, a seat map) and keep every guarantee: each line is checked against the component's declared props, actions stay governed by McpMutation, the stream never carries styling or code, and nothing is drawn that the app didn't write.

## How it fits the roadmap

- **It answers the most likely reason to drop Omni-IR after a trial:** "the catalog doesn't have what I need". Today the only way out is to leave the format for those screens, which loses the checks. Custom components were among the requests to competitors in the review of 2026-10-09.
- **It builds on the last five steps:** props are checked with the same rules as the Trusted Catalog on all three platforms (Steps 6–7, 13); app components can use the design tokens (16); their fields can use Step 19's `required` check; the model check covers them (17); the MCP bridge describes them to host models (18).
- **It comes before live screens (Step 22),** because live data is most useful in an app's own components, and before the Web Components renderer (Step 21), which then gets app components from the start.
- **It finishes two items the roadmap lists under this step:** pictures the app looks up when the screen is drawn, and keeping the system prompt small as the catalog grows.

## Who benefits

- **Developers** stop hitting the catalog's limit. They declare a component once (its props and what they mean), write its view on each platform they ship, and the model can use it with the same checks as the built-in components.
- **The people using their apps** get screens that fit the task (a product with its picture and price, a quantity they can step) instead of a generic list, drawn by the app's own code.
- **Organisations** keep one checked format for every screen instead of a second, unchecked path for "special" ones, and can review exactly what the model is allowed to place.

## What it adds

**A. A declaration, the same on every platform.** The app declares each component's props with the same kinds of value the catalog uses (text, number, true or false, one of a list, a `$state`, a picture name, a list of values, children):
```ts
const components = defineComponents({
  ProductCard: {
    description: "A product with its picture, name and price; children are its buttons.",
    positional: ["name", "children"],
    props: {
      name: text({ maxLength: 80 }),
      price: number({ minimum: 0 }),
      currency: oneOf(["USD", "EUR", "GBP"], { optional: true }),
      picture: picture({ optional: true }),
      rating: number({ minimum: 0, maximum: 5, optional: true }),
    },
    children: { max: 3 },
  },
  QuantityPicker: {
    description: "Choose how many, from min to max.",
    positional: ["value"],
    props: { value: state(), label: text(), min: number({ integer: true }), max: number({ integer: true }) },
    field: true,
  },
});
```
It compiles to the subset of JSON Schema that `conformance/schema.json` already uses, so the Swift and Kotlin parsers check it with the code they already have. A stream then writes:
```
$qty = 1
card = ProductCard("Canvas tote", [add], price=24, currency="USD", picture="product-1042")
qty = QuantityPicker($qty, label="How many", min=1, max=5)
add = Button("Add to bag", action="addM")
addM = McpMutation(add, tool="cart.add", params={productId: "1042", quantity: $qty})
```

**B. Views the app writes.** Each platform registers a view per component: a React component, a SwiftUI view or a composable. It receives only checked props (`$state` already read), its children as slots, and the design tokens. A component the app declared but didn't give a view on a platform shows the renderer's fallback there, with the screen-as-text line for it, and a test helper fails if any declared component has no view.

**C. Pictures looked up when drawn.** The app declares picture name patterns, such as `product-{id}` with ids of digits, and a function that turns a name into a picture. The parser accepts any name that matches; the model still writes a name, never a URL.

**D. The model learns them.** The system prompt and the MCP guide describe the app's components from their declarations, after the built-in catalog. Their size is measured and budgeted (decision 8).

## Decisions: pros, cons and trade-offs

**1. How an app declares a component: one language-neutral declaration** (recommended).
- *Pros:* identical checks on web, iPhone and Android, because all three parsers already interpret the same JSON Schema subset; the server, the system prompt, the MCP guide and the model check all read the same declaration; a TypeScript helper keeps it typed for web developers, and Swift and Kotlin read the exported JSON or build it in code.
- *Cons:* only the value kinds the catalog already has; no custom check code in a declaration (a postcode format, say).
- *Alternatives:* any Zod schema on the web (flexible, but Swift and Kotlin couldn't check it, so the platforms would disagree); a free-form JSON Schema (more power, and more ways for the three parsers to differ).
- *Trade-off:* the same small vocabulary as the built-in components; anything the vocabulary can't say stays in the tool's schema on the server, as in Step 19.

**2. Names: natural names, refused if they clash with a built-in** (recommended).
- *Pros:* `ProductCard` reads naturally to the model and to people reviewing streams; no grammar change.
- *Cons:* if a later format adds a built-in with the same name, the app has to rename its component when it updates (its registration fails at startup and in its tests, never silently).
- *Alternatives:* a required prefix such as `App_ProductCard` (no future clash, but awkward names the model gets wrong more often); dotted names such as `shop.ProductCard` (clear, but a grammar change for every parser).
- *Trade-off:* readable names now, a loud and rare rename later. The spec lists the built-in names per format version, so a clash can be checked before release.

**3. What an app component can do: show, edit one `$state`, hold children; never run an action itself** (recommended).
- *Pros:* governance stays exactly as it is (constraint 3): only a Button with an McpMutation reaches the backend. A seat map writes the chosen seat into `$seat`; a "Book" Button's McpMutation reads `$seat`. Step 19's checks apply: a component declared as a field gets `required`, and a press is blocked while it's empty.
- *Cons:* a component can't have its own "Book" action built in; the stream places a Button next to it (or among its children).
- *Alternative:* app components as McpMutation targets (fewer lines, but a second kind of governed control on every platform, and more for the model to get wrong).
- *Trade-off:* one governed control, the Button, everywhere.

**4. Drawing: the app's view on each platform, the renderer's fallback where it has none** (recommended).
- *Pros:* the app controls the look with its own code, the trusted part; one stream works on every platform, showing a fallback (and the screen-as-text line) where a view is missing; a test helper catches missing views before release.
- *Cons:* an app that ships on three platforms writes three views per component.
- *Alternative:* app components described as compositions of built-in components, needing no views (no extra code, but then they're templates, not new components, and can't draw a seat map).
- *Trade-off:* full freedom for the app's own code; the stream stays free of styling.

**5. The native models: one new component kind, "app", with its name** (recommended).
- *Pros:* Swift's and Kotlin's `ComponentType` stay the closed list of built-ins that views switch over; an app node carries `appType` (its name) beside the checked props.
- *Cons:* a new case in an enum is a source change for any app code that switches over every component type (Swift needs a `default` or `.app` case). Allowed in `0.x`; named in the changelog.
- *Alternative:* a separate node type for app components (no change to `ComponentType`, but every place that walks a screen has to handle two kinds of node).
- *Trade-off:* one small, visible change now for one way to walk a screen.

**6. The stream format stays 0.8** (recommended).
- *Pros:* the grammar and the built-in catalog don't change, so every app on 0.11 keeps working against new servers, with no refusal and retry. App components are agreed between an app and its own server, like its tools, which never needed a format version.
- *Cons:* an older app that receives a component it doesn't know shows a fallback with `unknown_component`, as it would for a tool it doesn't know; the version marker can't warn it.
- *Alternative:* format 0.9 (the marker would flag streams that may contain app components, but every 0.11 app would be refused and retry against new servers, for components only that app's own server would send).
- *Trade-off:* the fingerprint test still guards the built-in catalog; the spec gains a rule that a parser MAY accept the app's declared components, and the conformance cases carry their declarations.

**7. Pictures looked up when drawn: name patterns the app declares** (recommended).
- *Pros:* shops and user pictures that can't be listed in advance (`product-1042`, `avatar-u381`) work; the parser still checks every name against a declared pattern, and the model never writes a URL; the app's function decides what each name shows.
- *Cons:* a name can match the pattern and still have no picture; the renderer shows its picture fallback then.
- *Alternative:* let the app's view fetch pictures from an id prop (simpler, but outside the checks, and each app invents its own way).
- *Trade-off:* one checked way, used by built-in Images and app components alike.

**8. Prompt size: measure and budget now, send only the relevant components later if the numbers say so** (recommended).
- *Pros:* each app component costs about 40–80 tokens in the prompt; a test measures the system prompt and the MCP guide with the demo components and fails over a budget (the built-in part of the guide stays within its 1,500 tokens; app components get their own budget per component). Measurement is free: token counts, no model calls.
- *Cons:* an app with dozens of components pays for all of them in every request until selection exists.
- *Alternative:* choose components per request now (smaller prompts, but a selection step that can drop the component a request needed, and harder to test).
- *Trade-off:* simple and predictable first; selection is a separate step once a real app needs it. Time to the first line with a real model would cost money: tabled by the owner (2026-10-10).

**9. The model check covers app components** (recommended).
- *Pros:* the declarations become part of the setup's fingerprint (Step 17), so adding or changing a component triggers a new check; an app can add its own test requests that use its components, scored by the same parser.
- *Cons:* a new check whenever a declaration changes.
- *Alternative:* leave app components out of the check (no re-checks, but a model could pass the check and still misuse the app's components).
- *Trade-off:* the check keeps meaning "this model writes this app's screens well".

**10. Demo components: a ProductCard and a QuantityPicker** (recommended).
- *Pros:* one that shows (a picture looked up by product id, children for its buttons) and one that edits a `$state` with a field check; small enough to write well on web, iPhone and Android; used in the playground, both demo apps, a fixture and a landing example.
- *Cons:* less striking than a seat map.
- *Alternative:* a seat map (impressive, but three hand-drawn views and accessibility work, mostly about the drawing, not about Omni-IR).
- *Trade-off:* prove the mechanism on all three platforms; a seat map can be a later example.

## Cost and risk

- **Cost:** free. Tests and the playground use the mock model, which gets fixtures using the demo components. No model calls; prompt size is measured with a token counter.
- **Risk: the three parsers diverging.** Mitigated by the existing JSON Schema subset and new conformance cases that carry their component declarations, run by TypeScript, Swift and Kotlin; the fuzz corpus gains streams with app components.
- **Risk: an app component used as a way around the rules.** It can't carry styling or code (its props are checked values only), can't run actions (decision 3), can't load a URL (decision 7), and its view is the app's own code. The spec says so plainly.
- **Risk: the source change in Swift and Kotlin** (decision 5). Named in the changelog with the one-line fix.

## Checklist

**A. Declaring and parsing** *(tests first)*
- [ ] A.1 The declaration: `defineComponents` and the value helpers in `@omni-ir/core`, compiled to the JSON Schema subset; refused names (built-ins, reserved words) and bad declarations fail at registration
- [ ] A.2 The TypeScript, Swift and Kotlin parsers accept declared components and check their props, children and `$state`; conformance cases with declarations; fuzz corpus streams with app components
- [ ] A.3 Picture name patterns and the app's lookup, on all three platforms; `Image` accepts matching names too

**B. Drawing**
- [ ] B.1 React: a `components` prop with the app's views, slots for children, tokens; fallback where a view is missing; the test helper for missing views
- [ ] B.2 SwiftUI and Compose: the same, with the `.app` kind (CI on a `wip/**` branch)
- [ ] B.3 `describeScreen` writes app components from their declarations

**C. The model's side**
- [ ] C.1 The system prompt and the MCP guide describe app components from their declarations; size budgets tested
- [ ] C.2 The model check's fingerprint includes the declarations; apps can add test requests

**D. Demo**
- [ ] D.1 ProductCard and QuantityPicker in the playground, both demo apps, a fixture for the mock model and a landing example; a `cart.add` tool and handler

**E. Spec, docs, review**
- [ ] E.1 SPEC.md: app-defined components (document rules, what they may and may not do, picture patterns); a guide; CHANGELOG; the decision log
- [ ] E.2 A review page with screenshots on web, iPhone and Android (CI)
- [ ] E.3 Merge with your approval
- [ ] E.4 Release: a separate go-ahead from you
