# @omni-ir/react

React rendering for [Omni-IR](https://github.com/jdsouza1/omni-ir), an open protocol for generative UI. `OmniRenderer` draws a streaming Omni-IR document with the **Trusted Catalog**, a fixed set of components that own all styling. The model never writes HTML, CSS or code.

- Components appear as their lines arrive, with placeholders for parts that haven't arrived yet.
- A component that fails shows a fallback; the rest of the screen keeps working.
- Buttons that trigger backend actions stay disabled until an `McpMutation` approves them, and their params are checked against your tool registry before your handler runs.

## Install

```bash
npm install @omni-ir/react @omni-ir/core react
```

Requires React 19. ES modules only.

## Usage

```tsx
import { createParser } from "@omni-ir/core";
import { OmniRenderer, createMutationHandler, generate } from "@omni-ir/react";
import "@omni-ir/react/omni.css";
import { z } from "zod";

const tools = {
  "payments.confirm": z.strictObject({ amount: z.number().positive() }),
};

const parser = createParser({ tools });

export function Screen() {
  return <OmniRenderer store={parser.store} tools={tools} onMutation={(call) => console.log(call.tool, call.params)} />;
}

// Feed the parser from any stream: an LLM, a file, or an Omni-IR server.
parser.write('root = Card([title, pay])\ntitle = Heading("Confirm payment")\n');
parser.write('pay = Button("Pay $42.50", action="pay")\n');
parser.write('payM = McpMutation(pay, tool="payments.confirm", params={amount: 42.50})\n');
parser.end();
```

### With an Omni-IR server

If your server implements `POST /api/generate` (server-sent events) and `POST /api/mutate`, as the [reference server](https://github.com/jdsouza1/omni-ir/tree/main/server) does, two helpers connect them:

```ts
const outcome = await generate("a payment confirmation for $42.50", { parser });
const onMutation = createMutationHandler(); // posts governed actions to /api/mutate
```

### Images

Streams name pictures from your app's asset registry; they can never supply a URL. Pass the same registry to the parser (which rejects unknown names) and the renderer (which supplies the picture):

```ts
const assets = { "cabin-pines": { src: "/img/cabin.jpg", width: 640, height: 400 } };
const parser = createParser({ tools, assets });
// <OmniRenderer store={parser.store} tools={tools} assets={assets} onMutation={…} />
```

### Fields and confirmations

Fields can declare `required`, `format`, `minLength` and `maxLength`; the renderer checks the fields an action reads before it runs, and shows its own message under each one that fails. For actions that need the person's say-so, give a sentence per tool:

```tsx
<OmniRenderer store={parser.store} tools={tools} confirm={{ "payments.confirm": "Pay {amount}?" }} onMutation={…} />
```

The action runs only after the person confirms in the renderer's dialog. Nothing in a stream can skip or change it.

### App components

Components your app adds to the catalog (`defineComponents` in `@omni-ir/core`), drawn by your own views. Pass the same components to the parser:

```tsx
<OmniRenderer components={{ ProductCard, QuantityPicker }} resolvePicture={(name) => productPicture(name)} … />
```

Each view gets checked props with `$state` read, its children, pictures by name and, for a field, its value and message. `missingViews(components, views)` lists any without a view.

### Your own catalog

`catalog` replaces the built-in components with your own (trusted) ones. It must provide every component type; start from `DEFAULT_CATALOG`:

```ts
import { DEFAULT_CATALOG, type Catalog } from "@omni-ir/react";
const catalog: Catalog = { ...DEFAULT_CATALOG, Button: MyButton };
```

## Specification

The format and the renderer requirements are defined in [SPEC.md](https://github.com/jdsouza1/omni-ir/blob/main/SPEC.md).

## License

Apache-2.0
