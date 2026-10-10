# @omni-ir/elements

`<omni-screen>`: [Omni-IR](https://github.com/jdsouza1/omni-ir) screens in any web framework, or none. A model writes a screen as Omni-IR lines; the element checks every line and draws it with the Trusted Catalog, the same catalog, field checks, confirmations and governed actions as `@omni-ir/react`. One ES module with everything inside (about 80 KB compressed); no React in your app.

## Install

```bash
npm install @omni-ir/elements
```

Or with no build step, from the project's site:

```html
<script type="module" src="https://jdsouza1.github.io/omni-ir/elements/omni-elements.js"></script>
```

## Usage

```html
<omni-screen id="screen" theme="system"></omni-screen>
<script type="module">
  import "@omni-ir/elements";

  const screen = document.getElementById("screen");
  // The actions screens may call, with their params as JSON Schema (or Zod).
  screen.tools = {
    "payments.confirm": { type: "object", properties: { amount: { type: "number", exclusiveMinimum: 0 } }, required: ["amount"] },
  };
  // Runs only for a Button an McpMutation approved, with params already checked.
  screen.onMutation = (call) => fetch("/api/mutate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(call) });
  screen.addEventListener("omni-event", (e) => console.log(e.detail));

  // From an Omni-IR server (the reference server's POST /api/generate)…
  await screen.generate("a payment confirmation for $42.50");
  // …or from any stream: screen.write(text), then screen.end().
</script>
```

| | |
|---|---|
| **Properties** | `tools`, `assets`, `components`, `pictures`, `confirm`, `strings`, `onMutation`, `resolvePicture`, `fetch` |
| **Attributes** | `theme` (`light`, `dark`, `system`), `locale`, `endpoint` (an Omni-IR server's origin) |
| **Methods** | `write(text)`, `end()`, `reset()`, `generate(prompt)`, `describe()` |
| **Events** | `omni-event` (blocked actions, failed handlers, presses without an action), `omni-done` |

The catalog draws inside the element's shadow root, so your page's CSS can't break it. Set your brand with the design tokens on the element: `omni-screen { --omni-accent: #e5195f; }`.

### Your own components

Give each of your app's components its declaration and the tag of a custom element you write (in Vue, Svelte, Angular, Lit or plain JS):

```js
screen.components = {
  ProductCard: { description: "A product with its name and price.", positional: ["name", "children"], props: { name: { kind: "text" }, price: { kind: "number" } }, children: { max: 3 }, tag: "shop-product-card" },
};
```

The renderer creates `<shop-product-card>`, sets its checked `props`, `picture` and `field` as properties, and puts its children inside (give it a `<slot>`).

## Specification

The format and the rules every renderer follows are in [SPEC.md](https://github.com/jdsouza1/omni-ir/blob/main/SPEC.md). Apache-2.0; includes Preact (MIT) and Zod (MIT).
