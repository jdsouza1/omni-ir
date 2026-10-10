# Omni-IR — Step 22: live screens

Status: **Approved 2026-10-10 with the recommendations (all eight decisions); built, reviewed and merged 2026-10-10; not yet released.** Free: no paid API; the live demo's updates come from the reference server's own code and the mock model.

**Decided while building** (within the approved decisions):
- *How the model knows what the app will update:* the system prompt lists the app's **live parts** (`LIVE_PARTS`, `app/live.ts`), the ids and `$keys` it keeps current, so a model's screen uses them (decision 2 needed it: only the app writes updates, so it must know the ids).
- *A Button replaced by something without an action loses its McpMutation* ([10.31]), and the client sends the pressed Button's id with the action, so a result can say it's done where the Button was (decision 3).
- *Updates are rules in section 10*, not section 5, with two issue codes reported only for updates, so the stream format stays 0.8 (decision 7).
- *AG-UI needs nothing new:* its actions already go through `/api/mutate` ([10.20]), which carries updates; a live feed isn't offered over MCP, whose views have no network.

## Goal

A screen can change after it arrives. A delivery status moves from "Shipped" to "Out for delivery", a chart gets this hour's numbers, a table gains a row, and an action's result shows on the screen that started it. The stream still has no logic, every change is checked like a new line, and the changes come from the app's own code, never from the model.

## How it fits the roadmap

- **It closes the last open item in SPEC.md's "Not yet specified":** "A way to update or remove a component after its line has arrived". Today [5.3] forbids reassigning an id, so a screen is a snapshot.
- **It builds on Step 14's transport** (updates travel as server-sent events, like screens), **Step 15's backend** (the data comes from the app's own handlers), and **Steps 19 to 21** (fields, app components and `<omni-screen>` all receive updates the same way).
- **It's the most useful thing app components (Step 20) were waiting for:** a seat map or an order tracker that stays current.

## Who benefits

- **Developers** keep a screen up to date from their server with a few lines of Omni-IR (`status = Badge("Out for delivery", tone="success")`), checked by the same parser, instead of asking the model again or building a second UI for live data.
- **The people using their apps** see the current state without reloading, and see what their action did on the screen they pressed it on.
- **Organisations** get live screens without giving the model any new power: only the app's code can change a screen after it's drawn.

## What it adds

**A. Updates: the same lines, with new meaning in an update.** No new syntax. In an update (never in the model's screen), a line that assigns an existing id **replaces** that component, a line that assigns an existing `$key` **sets** that state, and a new id **adds** a component. A component leaves the screen when its parent's new line no longer lists it. For example:

```
$status = "Out for delivery"
status = Badge($status, tone="success")
eta = Text("Today by 6 pm")
```

Each update is checked like a screen: catalog, props, types, tree rules and governance. A rejected update line changes nothing, as now.

**B. Two ways updates arrive, both from the app's code:**
- **An action's result:** a handler may return update lines with its result (`{ ok: true, result, updates: "…" }`), so pressing "Request a return" can turn the button into a Notice "Return requested" on the same screen.
- **A live feed:** the app's server streams updates for a screen it served (`GET /api/live?screen=…`, server-sent events), for status changes and live numbers.

**C. The demo:** the order-status screen moves through "Shipped", "Out for delivery" and "Delivered" from the reference server's own code; the sales chart gets new numbers; requesting a return updates the screen.

## Decisions: pros, cons and trade-offs

**1. How a change is written: the same lines, read as updates** (recommended).
- *Pros:* no new syntax for any parser; an update is checked exactly like a screen; replacing a component and setting state cover status text, chart values, table rows and removals (a parent's new children list).
- *Cons:* replacing a component resends its whole line (a Badge or a Series is one short line; a big Table resends its children list, not its rows).
- *Alternatives:* new statements such as `update status(text="…")` and `remove banner` (more precise, but a grammar change every parser must learn); JSON patches (familiar to developers, but a second format beside Omni-IR).
- *Trade-off:* one language for screens and their changes.

**2. Who can change a screen: only the app's code, never the model** (recommended).
- *Pros:* the model's stream keeps its rules (a second assignment is still `duplicate_id`), so a model can't overwrite what it wrote earlier or what the app updated; updates come from handlers the app wrote and the server checks.
- *Cons:* "make that chart bigger" in a chat means a new screen from the model, not an update.
- *Alternative:* let the model's stream update too (follow-up edits in conversation, but a model could then rewrite a confirmation or a price after it was shown).
- *Trade-off:* the model draws a screen once; the app keeps it current.

**3. Two channels: action results and a live feed** (recommended).
- *Pros:* action results need no new connection (they ride on `/api/mutate`, the MCP bridge's action results and AG-UI); a live feed covers changes nobody pressed anything for (deliveries, prices, dashboards).
- *Cons:* two paths to specify and test.
- *Alternative:* only a live feed (one path, but every app would need a feed just to show "Saved" after a press).
- *Trade-off:* the common case is free; the live case is one endpoint.

**4. Fields belong to the person: updates can't change what someone is filling in** (recommended).
- *Pros:* an update that sets a `$key` bound to an Input, Select, Switch, DateInput or app field is rejected (`live_field_conflict`), so nobody's typing is overwritten mid-sentence; display state (a status, a total, a chart) changes freely.
- *Cons:* an app can't pre-fill a field from the server after the screen is drawn.
- *Alternative:* allow it only if the person hasn't touched the field yet (friendlier, but a race between the person and the server).
- *Trade-off:* a simple rule nobody gets surprised by; pre-filling stays the model's first line.

**5. Updates keep the screen steady** (recommended).
- *Pros:* a replaced component keeps its place and identity, so focus, scroll and a half-typed field elsewhere stay put; the renderer never moves focus because of an update; a replaced Notice is announced politely, other changes aren't announced (status changes are read when the person reaches them).
- *Cons:* a screen reader user isn't told about every change.
- *Alternative:* announce every change (complete, but a live dashboard would talk constantly).
- *Trade-off:* the app chooses what to announce by putting it in a Notice.

**6. The feed is resumable and bounded** (recommended).
- *Pros:* each update carries a sequence number; after a dropped connection the client asks to resume from the last one it applied, and the server resends what's missing or the screen's current version. Limits per update (lines, size) and per feed (updates per second) keep a runaway feed from freezing a page.
- *Cons:* the server keeps recent updates per screen.
- *Alternative:* start again from scratch after any drop (simpler, but the screen flickers back to its first version).
- *Trade-off:* a little server memory for screens that never jump backwards.

**7. The format stays 0.8; live updates are a transport feature** (recommended).
- *Pros:* screens don't change, so every app on 0.8 keeps working against new servers; an app that doesn't ask for updates never gets them, and action results with updates are ignored by renderers that don't apply them.
- *Cons:* the version marker can't tell an old app that it's missing updates (it never asked for them).
- *Alternative:* format 0.9 (the marker would announce it, but every 0.8 app would be refused and retry, for a feature only new apps use).
- *Trade-off:* SPEC.md gains the update rules (section 5) and the two channels (section 10); conformance cases carry updates.

**8. All three platforms in this step** (recommended).
- *Pros:* the web (React and `<omni-screen>`), iPhone and Android apply updates the same way, held to shared conformance cases; the iOS and Android demos show the order moving.
- *Cons:* the biggest part of the work; the SwiftUI and Compose parts build only on CI.
- *Alternative:* web first (faster, but a screen that updates on one platform and not another breaks the promise).
- *Trade-off:* a few more days for one behaviour everywhere.

## Cost and risk

- **Cost:** free. The demo's updates come from the reference server's code on a timer; the hosted playground plays the same updates in the browser.
- **Risk: an update used as a way around the rules.** It's checked like a screen, comes only from the app's code, can't touch fields, and can't add an action without an McpMutation and a registered tool.
- **Risk: three parsers disagreeing on updates.** Conformance cases and fuzz streams with updates, run by TypeScript, Swift and Kotlin.
- **Risk: performance on busy feeds.** Replacing one component re-checks only what it touches (as the incremental checks do today); a perf test streams a thousand updates.

## Checklist

**A. Updates in the parser** *(tests first)*
- [x] A.1 SPEC.md: what an update may do (replace, set, add, remove by omission), what it may not (fields, the model's stream), and its limits; conformance cases with updates
- [x] A.2 TypeScript, Swift and Kotlin apply updates with the incremental checks; fuzz streams with updates

**B. Channels**
- [x] B.1 Action results with updates: `/api/mutate`, the MCP bridge, AG-UI; the clients apply them
- [x] B.2 The live feed: `GET /api/live`, sequence numbers, resume, limits; the web, Swift and Kotlin clients; the in-browser API for the hosted playground

**C. Renderers**
- [x] C.1 React and `<omni-screen>`: replaced components keep their place and focus; Notices announced
- [x] C.2 SwiftUI and Compose: the same (CI on a `wip/**` branch)

**D. Demo and docs**
- [x] D.1 The order moving and the chart updating in the playground and both demo apps; a returned item updating its screen
- [x] D.2 A guide, CHANGELOG, the decision log; "Not yet specified" updated

**E. Review**
- [x] E.1 A review page with screenshots and a recording on web, iPhone and Android
- [x] E.2 Merge with your approval
- [ ] E.3 Release: a separate go-ahead from you
- [ ] E.4 A retrospective through every step (1 to 22), like the earlier one in the decision log: what worked, what didn't, lessons, and proposed fixes for your approval
