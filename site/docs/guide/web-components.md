# Any web framework

`<omni-screen>` draws Omni-IR screens in Vue, Svelte, Angular, plain HTML or any other web page, with the same catalog, field checks, confirmations, governed actions and app components as the React renderer. It's one ES module (about 80 KB compressed), with no React in your app.

## Install

```bash
npm install @omni-ir/elements
```

Or with no build step at all:

```html
<script type="module" src="https://jdsouza1.github.io/omni-ir/elements/omni-elements.js"></script>
```

[Try it in plain HTML](https://jdsouza1.github.io/omni-ir/elements/).

## Use it

```html
<omni-screen id="screen" theme="system"></omni-screen>
<script type="module">
  import "@omni-ir/elements";

  const screen = document.getElementById("screen");
  screen.tools = {
    "payments.confirm": { type: "object", properties: { amount: { type: "number", exclusiveMinimum: 0 } }, required: ["amount"] },
  };
  screen.onMutation = (call) => fetch("/api/mutate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(call) });
  await screen.generate("a payment confirmation for $42.50");
</script>
```

What only your app may decide is set as **properties**, in code: `tools` (each tool's params as JSON Schema or Zod), `assets`, `components`, `pictures`, `confirm`, `strings`, `onMutation`, `resolvePicture`. Plain settings are **attributes**: `theme` (`light`, `dark` or `system`), `locale`, and `endpoint`, the origin of an Omni-IR server for `generate()` and actions. Notices are **events**: `omni-event` (a blocked action, a failed handler, a press of a Button without an action) and `omni-done` when a `generate()` ends.

To feed it yourself, call `write(text)` as text arrives and `end()` when the stream ends; `reset()` starts a new screen and `describe()` gives the screen as text.

## In your framework

Every framework passes properties and listens to events on custom elements. Tell it `omni-screen` is one:

```vue
<!-- Vue: vite.config.js → vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === "omni-screen" } } }) -->
<omni-screen ref="screen" theme="system" @omni-event="onEvent"></omni-screen>
```

```svelte
<!-- Svelte -->
<omni-screen bind:this={screen} theme="system" onomni-event={onEvent}></omni-screen>
```

```ts
// Angular: schemas: [CUSTOM_ELEMENTS_SCHEMA] on the component
// <omni-screen #screen theme="system" (omni-event)="onEvent($event)"></omni-screen>
```

Complete examples for plain HTML, Vue, Svelte and Angular are in the repository's [examples](https://github.com/jdsouza1/omni-ir/tree/main/examples) folder; CI builds each one and checks it in a real browser.

## Your brand, your components

The catalog draws inside the element's shadow root, so your page's CSS can't break it. Set your brand with the design tokens on the element:

```css
omni-screen { --omni-accent: #e5195f; --omni-font: "Inter", system-ui, sans-serif; }
```

Your app's own components ([Your own components](./app-components.md)) are custom elements you write, in any framework. Give each declaration a `tag`:

```js
screen.components = {
  ProductCard: { description: "A product with its name and price.", positional: ["name", "children"], props: { name: { kind: "text" }, price: { kind: "number" } }, children: { max: 3 }, tag: "shop-product-card" },
};
```

The renderer creates `<shop-product-card>`, sets its checked `props` (each `$state` already read), `picture` and `field` as properties, and puts its children inside it (give it a `<slot>`). In Vue, `defineCustomElement` turns a component into one; Svelte, Angular (`@angular/elements`) and Lit can do the same.

## How it's built

`<omni-screen>` is the React renderer, run on Preact (a 4 KB React-compatible library) inside the element. There is one web catalog to keep correct, and the React renderer's tests run again on the Preact build in CI. On Preact a screen draws a frame after its line arrives instead of at once, which nobody sees.
