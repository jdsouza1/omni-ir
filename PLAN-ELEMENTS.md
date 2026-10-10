# Omni-IR — Step 21: a Web Components renderer

Status: **APPROVED 2026-10-10** with the recommendations (all eight decisions). Free: no paid API; tests and examples use the mock model. Example apps download free packages from npm in CI. Nothing here is built until you approve it.

## Goal

A developer using any web framework, or none, can draw Omni-IR screens with one element, `<omni-screen>`, with the same catalog, checks, governance, forms, confirmations and app components as the React renderer:

```html
<script type="module" src="https://jdsouza1.github.io/omni-ir/elements/omni-elements.js"></script>
<omni-screen id="screen" theme="system"></omni-screen>
<script type="module">
  const screen = document.getElementById("screen");
  screen.tools = { "payments.confirm": { type: "object", properties: { amount: { type: "number", exclusiveMinimum: 0 } }, required: ["amount"] } };
  screen.onMutation = (call) => fetch("/api/mutate", { method: "POST", body: JSON.stringify(call) });
  await screen.generate("a payment confirmation for $42.50");
</script>
```

## How it fits the roadmap

- **It answers the most requested feature** in the review of 2026-10-09: Vue, Svelte, Angular and Web Components were asked of [json-render](https://github.com/vercel-labs/json-render/issues/34), [Tambo](https://github.com/tambo-ai/tambo/issues/1721), [OpenUI](https://github.com/thesysdev/openui/issues/318) and others. Today Omni-IR serves React, SwiftUI and Compose only.
- **It builds on what exists:** the conformance suite defines what a renderer must do (SPEC.md section 8); the design tokens (Step 16) style it; the forms and confirmations (Step 19) and app components (Step 20) come with it.
- **It comes before live screens (Step 22),** so live updates arrive in every web framework at once.

## Who benefits

- **Developers** on Vue, Svelte, Angular, plain HTML or a server-rendered site, the largest group the project can't serve today, get screens with one element and no React in their app.
- **The people using their apps** get the same accessible catalog, field messages and confirmations as on React, iPhone and Android.
- **Organisations** with several front-end stacks can standardise on one format and one renderer for the web.

## What it adds

**A. `<omni-screen>`**, in a new package, `@omni-ir/elements`: one ES module with the parser, the catalog and the styles inside, also served from the site for a plain `<script>` tag.
- Properties for what only the app may set: `tools`, `assets`, `components`, `pictures`, `confirm`, `onMutation`, `resolvePicture`, `strings`.
- Attributes for plain settings: `theme`, `locale`, `endpoint` (an Omni-IR server, for `generate()` and actions).
- Methods: `write(text)`, `end()`, `generate(prompt)`, `describe()` (the screen as text).
- Events: `omni-event` (blocked actions, failed handlers, presses without an action) and `omni-done`.

**B. App components as the app's own custom elements:** `screen.components = { ProductCard: "shop-product-card" }`. The renderer creates `<shop-product-card>`, sets its checked props and its field as properties, and slots its children. The app writes that element in any framework (Vue, Svelte and Angular can all compile components to custom elements).

**C. Examples** for plain HTML, Vue, Svelte and Angular, built and checked in CI, and a guide.

## Decisions: pros, cons and trade-offs

**1. How it's built: the React renderer, run on Preact inside the element** (recommended).
- *Pros:* one catalog codebase for the web: every fix and every new component reaches React and the element at once, with the same tests. Preact (MIT, about 4 KB) replaces React's 69 KB; the whole element should come to about 125 KB compressed (the parser, 107 KB, plus the catalog, 15 KB, plus Preact, as measured separately), about the same as a renderer written from scratch. The React renderer's own test suite runs again against the Preact build to prove they behave the same.
- *Cons:* Preact's React compatibility layer could differ in a corner case (a test catches it, but a fix may need care); a third-party dependency in the element.
- *Alternatives:* bundle React itself (no compatibility risk, but about 70 KB more for every page); write a new framework-free renderer (smallest code, but a fourth implementation of the whole catalog to keep in step).
- *Trade-off:* one implementation, at the size of a separate one, with a test suite that proves they match.

**2. Styles: inside the element's shadow DOM, themed by the design tokens** (recommended).
- *Pros:* the page's CSS can't break the catalog, and the catalog's CSS can't leak into the page; the `--omni-*` tokens pass through the shadow boundary, so an app sets its brand colours as on React.
- *Cons:* a page can't restyle the catalog's insides beyond the tokens (by design: that's the Trusted Catalog); app components' custom elements bring their own styles.
- *Alternative:* render into the page (light DOM; the page's CSS and the catalog's could collide).
- *Trade-off:* isolation, with the same theming hooks as React.

**3. API: properties for what only the app may set, attributes for plain settings, events for notices** (recommended).
- *Pros:* tools, handlers and app components are functions and objects, which attributes can't carry; plain settings work in HTML and every framework's templates; `onMutation` returns the action's result, which an event can't.
- *Cons:* setting properties in HTML needs a line of script (as with every Web Component that takes data).
- *Alternative:* everything as DOM events (`omni-mutation` with a callback in `detail`) (more "web-like", but awkward for returning results and easy to forget to handle).
- *Trade-off:* the usual pattern for data-heavy custom elements, which Vue, Svelte and Angular all bind to directly.

**4. Tool params: JSON Schema or Zod** (recommended).
- *Pros:* a plain-HTML app writes tool params as JSON Schema (as the MCP bridge already does), with no build step; TypeScript apps keep Zod.
- *Cons:* two ways to write the same thing.
- *Alternative:* Zod only, re-exported from the package (one way, but plain-HTML apps would write schemas in a library's syntax).
- *Trade-off:* the format apps already use for their APIs, with Zod still welcome.

**5. App components: the app's own custom elements, by tag name** (recommended).
- *Pros:* framework-neutral: an app writes `<shop-product-card>` in Vue, Svelte, Angular, Lit or plain JS; the renderer passes checked props and the field as properties and puts children in its slot, so the app's element never sees a `$state` reference.
- *Cons:* the app defines one custom element per component.
- *Alternative:* functions that return DOM nodes (no custom elements, but re-drawing and events become the app's problem on every update).
- *Trade-off:* the standard way to share UI across frameworks.

**6. A new package, `@omni-ir/elements`, also served from the site** (recommended).
- *Pros:* React users don't download it; plain-HTML users get one `<script type="module">` from the site, no build tools; versioned with the other packages.
- *Cons:* a fourth package; its first version is published by hand by you, then its trusted publisher is added (as with `@omni-ir/mcp`).
- *Alternative:* a second entry point in `@omni-ir/react` (no new package, but React becomes a dependency of apps that don't use it).
- *Trade-off:* one more package for a clean install everywhere.

**7. Proof in four frameworks: example apps built and checked in CI** (recommended).
- *Pros:* plain HTML, Vue, Svelte and Angular apps each render a screen, run an action and check a field, built from the packed package as a user would install it; Angular gets its own CI job because its toolchain is heavy.
- *Cons:* CI time, and the examples' framework versions need updating now and then.
- *Alternative:* snippets in the docs only (cheaper, but nothing proves they work).
- *Trade-off:* the claim "works in every framework" is tested, not asserted.

**8. Size: a budget now, a lighter parser later** (recommended).
- *Pros:* a test fails if the element grows past 140 KB compressed. The parser is most of it (about 107 KB, mostly its schema library); a lighter parser is a separate piece of work that would shrink React, the element and the MCP view together.
- *Cons:* the first release is larger than it could be.
- *Alternative:* slim the parser in this step (smaller now, but a large change to the core mixed into a new renderer).
- *Trade-off:* ship the element at a measured size; list "a lighter parser" under Later.

## Cost and risk

- **Cost:** free. The examples install free packages from npm in CI; no model calls.
- **Risk: Preact behaving differently.** Mitigated by running the React renderer's test suite against the Preact build, and the element's own tests in a browser-like environment.
- **Risk: shadow DOM and accessibility.** Labels, `aria-describedby` and focus all stay inside one shadow root, where they work; the confirmation dialog and focus moves are tested.
- **Risk: a new package's first publish.** By hand by you, as with `@omni-ir/mcp`; the pack check covers it before that.

## Checklist

**A. The element** *(tests first)*
- [x] A.1 `@omni-ir/elements`: `<omni-screen>` with properties, attributes, methods and events; the React renderer built on Preact into one module with the styles inside a shadow root
- [x] A.2 The React renderer's tests run again against the Preact build; the element's own tests (registries as properties, `generate()` against the mock server, actions, fields, confirmations, fallbacks, themes)
- [x] A.3 Tool params as JSON Schema or Zod

**B. App components**
- [x] B.1 App components as the app's custom elements by tag name: props and field as properties, children slotted, field messages and focus

**C. Delivery**
- [x] C.1 The package (pack check, install test), the module served from the site, the size budget
- [x] C.2 Examples for plain HTML, Vue, Svelte and Angular, built and checked in CI

**D. Docs**
- [x] D.1 A guide, “Any web framework”; README; SPEC.md's renderer list; CHANGELOG; the decision log

**E. Review**
- [ ] E.1 A review page with screenshots from the four examples
- [ ] E.2 Merge with your approval
- [ ] E.3 Release: a separate go-ahead from you, and the first publish of `@omni-ir/elements` by hand by you
