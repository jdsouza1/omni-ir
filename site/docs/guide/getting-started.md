# Getting started

There are two ways in:

- **No code, about three minutes:** [use your own AI](https://jdsouza1.github.io/omni-ir/playground/#own-ai). Copy the instructions into ChatGPT, Claude or Gemini (a free account works), paste the reply back, and see your screen drawn. Nothing to install.
- **In your React app, about ten minutes:** the five steps below. Each one ends with what you should see.

Using Vue, Svelte, Angular or plain HTML? Follow the same steps with [`<omni-screen>`](/guide/web-components) in place of `OmniRenderer`. Building for iPhone or Android? See [iPhone, iPad and Mac](/guide/swift) and [Android](/guide/android).

## 1. Install

In a React app (for example one made with `npm create vite@latest`):

```bash
npm install @omni-ir/core @omni-ir/react zod
```

**You should see** the three packages in your `package.json`.

## 2. Draw a screen, with no model yet

This is what an AI writes in Omni-IR: a few plain lines, one part of the screen per line. Paste it into a new file and show `<OrderScreen />` anywhere in your app.

```tsx
// src/OrderScreen.tsx
import { createParser } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";
import "@omni-ir/react/omni.css";

const REPLY = `root = Card([title, status, ret])
title = Heading("Order #A1B2-7731")
status = Badge("Shipped")
ret = Button("Request a return", action="return")
retM = McpMutation(ret, tool="orders.requestReturn", params={orderId: "A1B2-7731"})
`;

const parser = createParser({ tools: {} });
parser.write(REPLY);
parser.end();

export function OrderScreen() {
  return <OmniRenderer store={parser.store} tools={{}} onMutation={() => {}} />;
}
```

**You should see** a card with the order number, a "Shipped" badge and a greyed-out "Request a return" button.

The button is off because the line `retM = McpMutation(…)` asks for an action called `orders.requestReturn`, and your app hasn't allowed it. Whatever an AI writes, it can only use the actions you list.

## 3. Allow the action

List the actions a screen may use, each with a schema for what it sends. Put them in their own file, because your server will check against the same list.

```ts
// src/tools.ts
import { z } from "zod";

export const tools = {
  "orders.requestReturn": z.strictObject({ orderId: z.string() }),
};
```

Then pass `tools` to the parser and the renderer:

```tsx
// src/OrderScreen.tsx
import { createParser } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";
import "@omni-ir/react/omni.css";
import { tools } from "./tools";

const REPLY = `root = Card([title, status, ret])
title = Heading("Order #A1B2-7731")
status = Badge("Shipped")
ret = Button("Request a return", action="return")
retM = McpMutation(ret, tool="orders.requestReturn", params={orderId: "A1B2-7731"})
`;

const parser = createParser({ tools });
parser.write(REPLY);
parser.end();

export function OrderScreen() {
  return <OmniRenderer store={parser.store} tools={tools} onMutation={(call) => console.log(call.tool, call.params)} />;
}
```

**You should see** the button turn on. Pressing it logs `orders.requestReturn { orderId: "A1B2-7731" }` in the browser's console.

## 4. Connect your own model

Now an AI writes the screen. On your server, `buildSystemPrompt` turns your tools into instructions that teach any model Omni-IR, and the reply streams back to the browser as plain text. This example uses Claude with the [Anthropic SDK](https://www.npmjs.com/package/@anthropic-ai/sdk) (`npm install @anthropic-ai/sdk express`) and your own API key; any model works the same way: send it the same instructions and pass on the text it writes. `buildSystemPrompt` needs `@omni-ir/core` 0.15.0 or later.

```ts
// server.ts
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { buildSystemPrompt } from "@omni-ir/core";
import { tools } from "./src/tools";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY
const system = buildSystemPrompt({ tools });

export const app = express();
app.use(express.json());

app.post("/api/screen", async (req, res) => {
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-5-5",
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: String(req.body.request) }],
  });
  res.type("text/plain");
  stream.on("text", (text) => res.write(text));
  await stream.finalMessage();
  res.end();
});

app.listen(3000);
```

In the browser, feed the text to a new parser as it arrives. (With Vite, point `/api` at port 3000 with `server.proxy` in `vite.config.ts`.)

```tsx
// src/OrderScreen.tsx
import { useState } from "react";
import { createParser } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";
import "@omni-ir/react/omni.css";
import { tools } from "./tools";

export function OrderScreen() {
  const [parser, setParser] = useState(() => createParser({ tools }));

  async function ask(request: string) {
    const next = createParser({ tools });
    setParser(next);
    const response = await fetch("/api/screen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request }),
    });
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) next.write(chunk.value);
    next.end();
  }

  return (
    <>
      <button onClick={() => ask("Where is my order A1B2-7731?")}>Where is my order?</button>
      <OmniRenderer store={parser.store} tools={tools} onMutation={(call) => console.log(call.tool, call.params)} />
    </>
  );
}
```

**You should see** the screen draw itself line by line after you press "Where is my order?". The model chooses the layout; your app draws it with its own components, and only the actions in `tools` can be switched on.

## 5. Run the action on your server

The browser already checked the action's params against the schema. Your server checks them again, because a request can come from anywhere, and then checks that this person may do it. Its answer can change the screen: here it replaces the badge.

```ts
// actions.ts
import type { Express } from "express";
import { tools } from "./src/tools";

export function addActions(app: Express) {
  app.post("/api/action", (req, res) => {
    const tool = tools[req.body.tool as keyof typeof tools];
    const params = tool?.safeParse(req.body.params);
    if (!tool || !params?.success) return void res.status(400).json({ error: "Not an allowed action." });
    // Check here that the signed-in person may return this order, as you would in any API.
    res.json({ update: 'status = Badge("Return requested")\n' });
  });
}
```

Call `addActions(app)` in `server.ts` before `app.listen`. In `OrderScreen`, send the action to your server and apply its answer:

```tsx
// src/runAction.ts
import type { OmniParser } from "@omni-ir/core";
import type { MutationCall } from "@omni-ir/react";

export async function runAction(parser: OmniParser, call: MutationCall) {
  const response = await fetch("/api/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool: call.tool, params: call.params }),
  });
  const result = await response.json();
  if (result.update) parser.update(result.update);
}
```

```tsx
<OmniRenderer store={parser.store} tools={tools} onMutation={(call) => runAction(parser, call)} />
```

**You should see** the badge change to "Return requested" when you press the button.

That's the whole loop: the AI describes a screen, your app draws it with its own components, and every action goes through your server's checks.

## What the AI writes

```
root = Card([title, amount, note, actions])
title = Heading("Confirm payment")
$amount = 42.50
amount = Text($amount, format="currency", currency="USD")
$note = ""
note = Input($note, label="Note for merchant (optional)")
actions = Stack([confirm, cancel], direction="row")
confirm = Button("Pay now", action="pay")
confirmPay = McpMutation(confirm, tool="payments.confirm", params={amount: $amount, note: $note})
cancel = Button("Cancel", variant="secondary")
```

- Every line is `id = Component(arguments)` or `$key = value`. There is no nesting, no logic and no markup.
- `root` comes first, so the card appears at once and its parts fill in as their lines arrive.
- `$amount` and `$note` are state: the Input edits `$note`, and the action sends its current value.
- `confirm` has an `action`, so it stays off until its `McpMutation` names a tool your app allows.

Every component is listed in [Components](/reference/components), and the full rules are in the [specification](/spec).

## Next

- [Web (React)](/guide/react): streaming helpers for a server that speaks Omni-IR's transport, and governed actions with `createMutationHandler`
- [Running real actions](/guide/actions): access rules, sign-in and idempotency
- [Forms and confirmations](/guide/forms), [your own components](/guide/app-components), [live screens](/guide/live-screens) and [themes](/guide/themes)
- [How it works](/guide/how-it-works): the pipeline from model text to pixels
