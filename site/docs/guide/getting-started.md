# Getting started

Omni-IR has three parts, and you can adopt them one at a time:

1. **A model writes Omni-IR**: flat lines such as `title = Heading("Confirm payment")`, guided by a system prompt.
2. **Your app parses the stream** line by line, checking every line against the spec, your tool registry and your picture registry.
3. **Your app draws the result** with the Trusted Catalog: native components that own all styling.

The quickest way to see all three is the [playground](https://jdsouza1.github.io/omni-ir/playground/), which runs a free mock model in your browser.

## The format in one minute

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
- `$amount` and `$note` are state: the Input edits `$note`, and the mutation sends its current value.
- `confirm` has an `action`, so it stays disabled until its `McpMutation` names a tool your app registered.

Every component and prop is listed in [Components](/reference/components); the full rules are in the [specification](/spec).

## Web (React)

```bash
npm install @omni-ir/core @omni-ir/react react
```

```tsx
import { createParser } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";
import "@omni-ir/react/omni.css";
import { z } from "zod";

// The backend actions a screen may trigger, each with a schema for its params.
const tools = {
  "payments.confirm": z.strictObject({ amount: z.number().positive() }),
};

const parser = createParser({ tools });

export function Screen() {
  return <OmniRenderer store={parser.store} tools={tools} onMutation={(call) => myBackend.run(call.tool, call.params)} />;
}

// Feed the parser from any stream: a model's reply, a file, or an Omni-IR server.
parser.write('root = Card([title, pay])\ntitle = Heading("Confirm payment")\n');
parser.write('pay = Button("Pay $42.50", action="pay")\n');
parser.write('payM = McpMutation(pay, tool="payments.confirm", params={amount: 42.50})\n');
parser.end();
```

With a server that implements `POST /api/generate` and `POST /api/mutate`, two helpers do the streaming and the governed actions: see [Web (React)](/guide/react).

## iPhone, iPad and Mac (SwiftUI)

Add `https://github.com/jdsouza1/omni-ir` with Swift Package Manager (from `0.8.0`) and use `OmniIRSwiftUI`:

```swift
let store = OmniStore(tools: tools)
OmniView(store: store, onMutation: { call in try await myBackend.run(call.tool, call.params) })
// store.write(text) as the stream arrives, then store.end()
```

Details: [iPhone, iPad and Mac](/guide/swift).

## Android (Jetpack Compose)

Include the modules from `android/` (not on Maven Central yet) and use `OmniView`:

```kotlin
val store = remember { OmniStore(tools) }
OmniView(store = store, onMutation = { call -> myBackend.run(call.tool, call.params) })
// store.write(text) as the stream arrives, then store.end()
```

Details: [Android](/guide/android).

## Prompting a model

A model learns Omni-IR from a system prompt that lists the components, the rules and your tools. The reference server generates one from the schema, so it never describes anything the parser would reject: run `npm run prompt:print` in the repository to see it, and `npm run validate -- reply.omni` to check a model's reply. The reference server streams from a free mock model by default; a Claude adapter is included and is off unless you turn it on.

## Your tools are the boundary

The model can only name tools you registered, with params your schemas accept. That proves a request is well-formed, not that the signed-in user may make it: **your tool handlers must still check authorization**, as any API would.

## Next

- [How it works](/guide/how-it-works): the pipeline from model text to pixels
- [Specification](/spec) and [conformance suite](/conformance), if you're writing another implementation
- [Contributing](/project/contributing)
