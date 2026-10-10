# @omni-ir/core

The core of [Omni-IR](https://github.com/jdsouza1/omni-ir), an open protocol for generative UI. A model writes flat, line-oriented Omni-IR instead of HTML or code. This package parses it as it streams in, validates every line against a strict Zod schema, and keeps the result in a reactive document store. It has no UI framework dependency; render the document with [`@omni-ir/react`](https://www.npmjs.com/package/@omni-ir/react) or your own renderer.

```
root = Card([title, pay])
title = Heading("Confirm payment")
pay = Button("Pay $42.50", action="pay")
payM = McpMutation(pay, tool="payments.confirm", params={amount: 42.50})
```

## Install

```bash
npm install @omni-ir/core
```

Requires Node 22+ or a modern browser. ES modules only.

## Usage

```ts
import { createParser } from "@omni-ir/core";
import { z } from "zod";

// The backend actions a screen may trigger, each with a schema for its params.
const tools = {
  "payments.confirm": z.strictObject({ amount: z.number().positive() }),
};

const parser = createParser({ tools });
parser.subscribe((event) => {
  if (event.type === "error") console.warn(`line ${event.issue.line}: ${event.issue.message}`);
});

// Write chunks as they arrive (strings or UTF-8 bytes, split anywhere).
parser.write('root = Card([title])\ntitle = Heading("Hel');
parser.write('lo")\n');
const issues = parser.end(); // whole-document check at the end of the stream

const doc = parser.getSnapshot();
console.log(doc.nodes.get("title")?.props); // { text: "Hello" }
```

`parseStream(asyncIterable, options)` does the same for a whole stream, such as an LLM token stream.

### What else is exported

- `COMPONENTS`, `COMPONENT_TYPES`: the component catalog and its props, the single authority on what a stream may contain.
- `ISSUE_CODES`: every error and warning code, with its severity and meaning.
- `LIMITS`: line length, text length, children and other limits.
- `validateStatement`, `validateDocument`, `parseLine`, `LineBuffer`, `createStore`: the pipeline's individual stages.
- `describeComponent`, `describeValue`: plain-language descriptions of the schema, used to write system prompts.
- `checkField`, `fieldsReadBy`: the field checks every renderer runs before an action (SPEC.md section 8, Fields).
- `describeScreen`: a plain-text outline of a screen, for logs, tests and hosts that can't draw it; what the person typed stays out unless asked.

## Security model

- Streams can only use the fixed component catalog. Unknown components, unknown props and free-form values (styles, class names, HTML) are rejected.
- A Button that triggers a backend action must be governed by an `McpMutation` naming a tool in your registry. Unknown tools are rejected.
- Images are named from your app's asset registry (`createParser({ tools, assets })`), never given as URLs.
- Validating a stream says it is well-formed, not that an action is allowed: check params again on your server and authorize the user before running any tool.

## Specification

The format is defined in [SPEC.md](https://github.com/jdsouza1/omni-ir/blob/main/SPEC.md), with a [language-neutral conformance suite](https://github.com/jdsouza1/omni-ir/tree/main/conformance) for other implementations.

## License

Apache-2.0
