# Your own components

The catalog covers most screens, but your app may need something it doesn't have: a product card, a quantity picker, a seat map. Declare it, write its view, and the model can use it with the same guarantees as the built-in components. Every line is checked against your declaration, actions still need an McpMutation, and the stream still carries no styling, code or URLs.

## Declare it once

```ts
import { defineComponents, list, number, oneOf, picture, picturePattern, state, text } from "@omni-ir/core";

export const COMPONENTS = defineComponents({
  ProductCard: {
    description: "A product with its picture, name and price. Its children are the product's buttons.",
    positional: ["name", "children"],
    props: {
      name: text({ maxLength: 80 }),
      price: number({ minimum: 0 }),
      currency: oneOf(["USD", "EUR", "GBP"], { optional: true }),
      picture: picture({ optional: true }),
      badges: list("text", { maxItems: 3, optional: true }),
    },
    children: { max: 3 },
  },
  QuantityPicker: {
    description: "Choose how many, from min to max.",
    positional: ["value"],
    props: { value: state("number"), label: text(), min: number({ integer: true, state: false }), max: number({ integer: true, state: false }) },
    field: true,
  },
});

export const PICTURES = [picturePattern("product-{id}", { id: "digits", maxLength: 8 })];
```

| Kind | Accepts |
|---|---|
| `text()` | Text, with optional lengths; or a `$state` whose value is shown (unless `state: false`) |
| `number()` | A number, with optional limits or `integer: true`; or a `$state` (unless `state: false`) |
| `boolean()` | `true` or `false` |
| `oneOf([...])` | One of the listed text values |
| `picture()` | A picture name: registered, or matching one of your picture families |
| `list("text" \| "number")` | A list of values, at most 50 |
| `state("text" \| "number" \| "boolean")` | The `$state` the component edits; the prop must be called `value` |

Add `children: { max }` for a component that holds others, and `field: true` for one that edits a value the person fills in: it then accepts `required=true` and joins the checks before a press, like the catalog's fields ([Forms and confirmations](./forms.md)).

A bad declaration throws when your app starts: a name the catalog already uses, a prop called `action`, a minimum above its maximum, and so on. Names are natural (`ProductCard`), so if a later format adds a built-in with the same name, your app tells you at startup and you rename yours.

Pass the components to the parser, and the model can use them:

```ts
const parser = createParser({ tools, assets, components: COMPONENTS, pictures: PICTURES });
```

```
card = ProductCard("Canvas tote", [add], price=24, currency="USD", picture="product-1042")
$qty = 1
qty = QuantityPicker($qty, label="How many", min=1, max=5, required=true)
add = Button("Add to bag", action="addToBag")
addToBag = McpMutation(add, tool="cart.add", params={productId: "1042", quantity: $qty})
```

## Write its view

Your view is your code, the trusted part. It gets the checked props with each `$state` already read, its children, pictures by name, and for a component that edits a `$state`, its value and a way to change it:

```tsx
import { OmniRenderer, missingViews, type AppViewProps } from "@omni-ir/react";

function ProductCard({ props, children, picture }: AppViewProps) {
  const pic = picture(props.picture as string | undefined);
  return (
    <article>
      {pic && <img src={pic.src} alt="" />}
      <h3>{String(props.name)}</h3>
      {children}
    </article>
  );
}

<OmniRenderer components={{ ProductCard, QuantityPicker }} resolvePicture={lookUpProductPicture} … />;

// In a test: every declared component has a view.
expect(missingViews(COMPONENTS, VIEWS)).toEqual([]);
```

Where a component has no view, the renderer shows its own small fallback and draws the rest of the screen. On iPhone, pass `appViews` to `OmniView` and `components` to `OmniStore`; on Android, the same with composables. The declarations are plain JSON (`componentDeclarations(COMPONENTS)`), so all three platforms read one file, as the [demo apps](https://github.com/jdsouza1/omni-ir/blob/main/app/components.json) do.

## Pictures looked up when drawn

Shops and people have more pictures than you can register in advance. A picture family such as `product-{id}` lets a stream name `product-1042`; the parser checks the name against the family, and your `resolvePicture` turns it into a picture when the screen is drawn. The model still never writes a URL, and should only use an id the request gives it (the system prompt says so).

## What an app component can't do

- **Run an action.** Only a Button with an McpMutation reaches your backend. A component can hold a Button among its children, or edit a `$state` that a Button's McpMutation sends.
- **Carry styling or code.** Its props are the checked values you declared.
- **Load a URL.** Pictures are names, checked like any other.

## The model learns them

The system prompt and the MCP guide describe your components from their declarations. Each adds about 70 to 100 tokens, depending on its props; tests keep the guide's fixed part within 1,350 tokens and each component within 120. Your declarations are part of the [model check](./model-check.md)'s fingerprint, so changing one asks for a new check, and you can add your own test requests to the challenge pool.

Over [MCP Apps](./mcp.md), pass `components` to `createOmniMcpServer`: lines are checked and the screen as text names them. The built-in view has no code for them and shows its fallback, so pass a view built with your components as `viewHtml` to draw them there.

## Older apps

App components don't change the stream format's version: like your tools, they are agreed between your app and your own server. An app that doesn't know one shows a fallback in its place.

The rules are in SPEC.md, [5.27] to [5.30] and [8.7].
