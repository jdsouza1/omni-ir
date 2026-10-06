# Use with AG-UI

[AG-UI](https://docs.ag-ui.com/) is an event protocol that many agent frameworks use to stream to an app. Omni-IR travels over it as one **activity message** of type `omni-ir`: AG-UI 1.0's slot for UI that only the app draws. Apps that don't know `omni-ir` skip it, as AG-UI requires, so nobody sees raw Omni-IR text. The mapping is part of the specification ([rules 10.18 to 10.20](../spec#_10-transport)).

```
RUN_STARTED       {threadId, runId}
ACTIVITY_SNAPSHOT {messageId: "screen-1", activityType: "omni-ir", content: {version: "0.5", lines: []}}
ACTIVITY_DELTA    {messageId: "screen-1", activityType: "omni-ir", patch: [{op: "add", path: "/lines/-", value: "root = Card([title])"}]}
ACTIVITY_DELTA    … one patch per complete line …
RUN_FINISHED      (or RUN_ERROR)
```

Each update adds one complete line. Omni-IR acts on complete lines anyway, so this costs nothing in speed, and each update stays small.

## In an agent backend (TypeScript)

`AgUiEncoder` turns the model's text into these events. Give it each piece of text as it arrives:

```ts
import { AgUiEncoder } from "@omni-ir/core/ag-ui";

const encoder = new AgUiEncoder({ threadId, runId, messageId: `${runId}-screen` });
send(encoder.start());
for await (const text of modelText) send(encoder.write(text));
send(encoder.finish()); // or encoder.fail(message, code) if the model failed
```

`send` is whatever your framework uses to emit AG-UI events. Write only the model's text: the version travels in the snapshot, not as a line.

The reference server has an endpoint that does exactly this: `POST /api/ag-ui` takes AG-UI's run input (`RunAgentInput`), uses the last user message as the prompt, and answers over AG-UI's HTTP binding.

## In an app (TypeScript)

`createAgUiReader` feeds an Omni-IR parser from the events your AG-UI client receives:

```ts
import { createParser } from "@omni-ir/core";
import { createAgUiReader } from "@omni-ir/core/ag-ui";

const parser = createParser({ tools, assets });
const reader = createAgUiReader(parser);
agent.subscribe((event) => {
  const { error } = reader.feed(event);
  if (error) console.warn("Omni-IR update refused:", error);
});
// Render parser.store with <OmniRenderer> as usual.
```

Every line still goes through the parser and your registries, exactly as with Server-Sent Events: the screen is identical either way, line numbers included.

## What the reader refuses

Omni-IR never lets a line be rewritten once it has arrived, so the reader accepts only added lines. An update that replaces, removes or moves a line, adds anywhere but the end, or a later snapshot that changes lines already received, is refused and changes nothing. A later snapshot that only adds lines, as some middleware sends after merging updates, is accepted.

## Actions don't go through the agent

AG-UI carries the screen, never the authority to act. A governed button still calls your app's own action endpoint (`/api/mutate`), which checks the tool and the params itself. Nothing the agent sends can run an action.

## Other platforms

The AG-UI helpers are in the TypeScript package for now. The iOS and Android clients speak Omni-IR's own transport ([Servers and transports](./transport)).
