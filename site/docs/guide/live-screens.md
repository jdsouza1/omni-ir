# Live screens

A screen can change after it arrives: a delivery status moves on, a chart gets this hour's numbers, a pressed button says it's done. The changes come from your app's code, never from the model, and each one is checked like a new screen before anything on it changes.

## Updates

An update is Omni-IR text, the same lines a stream has. On a screen whose stream has ended:

- a line for an id the screen has **replaces** that component;
- a line for a `$key` the screen has **sets** that value;
- any other line **adds**;
- a component the update stops listing **leaves**, with everything inside it.

```
order_status = Badge("Delivered", tone="success")
```

An update is applied whole or not at all. If any line is wrong, or the screen it would leave breaks a rule (a Button with an action and no McpMutation, a chart whose numbers don't match its labels), nothing changes and the issues come back with their line numbers. A rejected update is a bug in your code, so tell your logs, not the person.

Two things an update can't do:
- **Change what the person is entering.** An update that sets a `$key` an Input, DateInput, Select, Switch or app field reads is refused (`live_field_conflict`).
- **Come from the model.** Inside a stream, a second line for the same id is still an error, so a model can't rewrite a price or a confirmation it already showed.

What stays on the screen keeps its place: focus, scrolling, an open tab and half-typed text are untouched, and nothing moves focus. The renderer reads out a Notice the update adds or changes, politely, and nothing else, so put what the person must hear in a Notice.

```ts
const result = parser.update('order_status = Badge("Delivered", tone="success")\n');
if (!result.applied) console.warn(result.issues);
```

`OmniStore.update(_:)` in Swift, `OmniStore.update(text)` in Kotlin and `screen.update(text)` on `<omni-screen>` do the same.

## After a button is pressed

An action's handler can return an update with its result. The client sends the pressed Button's id, so the update can name it, and a Button replaced by something without an action loses its McpMutation with it:

```ts
// The server: the result of orders.requestReturn, for the Button that was pressed
{ "ok": true, "tool": "orders.requestReturn", "result": { … },
  "update": "returnItem = Notice(\"Return requested. We'll email you a label.\", tone=\"success\")\n" }
```

```ts
// The browser
const onMutation = createMutationHandler({ onUpdate: (text) => parser.update(text) });
```

In the reference server, these updates are in `ACTION_UPDATES` (`app/live.ts`). `<omni-screen>` and the MCP bridge apply them by themselves; in Swift and Kotlin, pass `onUpdate` to `mutationHandler`.

## Screens your app keeps current

For changes nobody pressed anything for, the server tells the client that it follows a screen (a `live` event with the screen's id), and the client reads its updates from `GET /api/live`. A dropped connection picks up from the last update it received; a server that no longer has every update it missed sends one that brings the screen up to date.

```ts
const outcome = await generate("where is my order?", { parser });
if (outcome.status === "done" && outcome.screen) {
  await followScreen(outcome.screen, { parser, signal });
}
```

`<omni-screen>` follows by itself after `generate()`. In Swift and Kotlin: `client.follow(screen, into: store)` and `client.follow(screen, store)`.

Your app has to know which ids to update, so it tells the model. The reference server's system prompt lists its **live parts**, the ids and `$keys` it keeps current (`LIVE_PARTS` in `app/live.ts`):

```
## Live parts
The app keeps these parts up to date while the screen is open. When a screen shows one, give it exactly this id or $key; the app changes it later, so write only its first version.
- order_status: an order's delivery status, as a Badge
- sales_today: today's orders by hour, as a LineChart
```

A **feed** in `app/live.ts` says which screens it follows and what it sends. The demo's are on timers: the order goes out for delivery and then arrives, and the sales chart gains an hour every few seconds. A real app sends updates when its own data changes. Every update is checked against the server's own copy of the screen before it is sent.

Try it in the [playground](https://jdsouza1.github.io/omni-ir/playground/): ask "where is my order?" and wait, or press "Request a return".

The rules are in SPEC.md, [10.29] to [10.40] and [8.8]. Updates don't change the stream format: a stream is read exactly as before, and an app that doesn't follow screens never receives any.
