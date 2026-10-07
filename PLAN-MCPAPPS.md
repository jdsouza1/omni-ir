# Omni-IR — Step 18: the MCP Apps bridge

Status: **DONE**, released as `v0.10.1` (2026-10-07). Approved 2026-10-07 with the recommendations (all seven decisions). Free: tests use the MCP SDK's in-memory transport and a fake host; nothing calls a paid API. Trying it in Claude or ChatGPT is a manual check in the owner's own app, at no extra cost.

## Goal

A screen written in Omni-IR shows up, rendered by the Trusted Catalog, inside the AI apps people already use: Claude, ChatGPT, VS Code, Cursor and other hosts of [MCP Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/), the official MCP extension for interactive interfaces. The host's own model writes the Omni-IR, the screen streams in line by line as it writes, and every action still goes through a registered tool that the server checks again.

## How it fits the roadmap

- **It's a transport, like AG-UI (Step 14).** MCP Apps already carries interfaces to millions of people, but as HTML that a server's own code builds. Omni-IR adds what that lacks when a *model* builds the interface: a fixed catalog, no code from the model, and governed actions. The bridge is one HTML view (our parser and renderer) and one MCP server; the format doesn't change.
- **It builds on what's done:** the parser and React catalog, the tool registry and handlers with their access rules (Step 15), the themes and tokens (Step 16) for matching the host's look, and SPEC section 10's transport rules.
- **It comes before app-defined components** (now Step 19): a place where people see Omni-IR screens is worth more than more kinds of screens, and app components will reach those hosts through the same bridge.

## Who benefits

- **Developers** can give their MCP server rich, safe screens without writing HTML for each one, and without trusting the model with code: the model writes a few lines, the catalog draws them. One description of the app's tools and pictures serves their own app and every MCP host.
- **The people using those hosts** get real forms, tables and charts in the conversation, that stream in as the model writes, look like the host, and ask before acting where the host requires it.
- **Organisations** can let assistants show screens for their systems with the same guarantees they get in their own apps: no model-written code in the conversation, every action checked by their server and recorded in its audit trail.

## How it works

1. The **MCP server** (`@omni-ir/mcp`) offers a tool, `show_screen`, whose argument is Omni-IR text, and a UI resource, `ui://omni-ir/screen` (`text/html;profile=mcp-app`), linked by `_meta.ui.resourceUri`. The tool's description teaches the format, generated from the schema like the system prompt.
2. The **host's model** calls `show_screen` with Omni-IR lines as its argument. The host loads the UI resource in its sandboxed iframe.
3. The **view** (one HTML file: `@omni-ir/core`, `@omni-ir/react`, `omni.css` and the app's pictures as `data:` URIs, no network) receives the argument as it streams (`ui/notifications/tool-input-partial`), writes each new complete line to the parser, and renders with the catalog. When the whole argument arrives (`tool-input`), it ends the parser.
4. The **tool result** returned to the model lists any rejected lines and their issue codes, so the model can correct the screen on its next turn.
5. **Actions:** each tool in the app's registry is also an MCP tool marked `visibility: ["app"]` (hidden from the model, callable only from the view). A pressed button sends `tools/call` through the host, which may ask the person first; the server checks the params against the tool's schema and runs its handler with its access rule, exactly as `POST /api/mutate` does.
6. **Look:** the host's CSS variables (`hostContext.styles`) and light or dark theme are mapped onto the catalog's design tokens, so screens match the conversation around them.

## Decisions: pros, cons and trade-offs

**1. Who writes the Omni-IR: the host's model, as the tool's argument** (recommended).
- *Pros:* no second model and no cost to the server; the screen streams as the model writes; the conversation's context (what the person asked) is already there.
- *Cons:* we don't choose or check the model: the host does. The model check (Step 17) can't challenge it; only the per-line checks and the feedback in the tool result apply.
- *Alternative:* a `generate_screen(prompt)` tool where our server calls its own model (we could check that model, but every screen costs a second model call, adds latency, and loses the conversation's context).
- *Trade-off:* the parser's checks on every line are the guarantee either way; the model check was always about quality, so losing it here costs quality signals, not safety.

**2. Teach the format in the tool's description** (recommended).
- *Pros:* every host shows tool descriptions to its model; generated from the schema, so it can't describe anything the parser rejects.
- *Cons:* a long description (the full system prompt is about 2,600 tokens) is sent with every request in that conversation.
- *Alternatives:* a short description plus the full guide as an MCP resource or prompt (smaller, but hosts don't reliably show resources to the model); the full system prompt (most complete, most tokens).
- *Trade-off:* a compact guide (target under 1,500 tokens: grammar, catalog, the app's tools and pictures, one example), measured by a test, with the full guide as a resource for hosts that use it.

**3. Actions as app-only MCP tools, checked again on the server** (recommended).
- *Pros:* the same governance as in our own apps: registered tool, params checked by its schema, access rule, idempotency key, audit trail; the host can also ask the person before each call.
- *Cons:* who is signed in works differently in MCP (the host's connection to the server, with MCP's own authorization) than in our apps (sessions); the bridge must map it.
- *Alternative:* screens only, no actions, in the first version (simpler, but forms that can't be sent are half a feature).
- *Trade-off:* actions are what make screens useful; reusing the Step 15 handlers keeps one set of rules.

**4. Stream the screen from partial arguments** (recommended).
- *Pros:* the screen builds as the model writes, as in our own apps; the parser already handles partial input line by line.
- *Cons:* partial arguments are the host's best guess at unfinished JSON; a host may send none (then the screen appears at the end) or a guess that changes.
- *Alternative:* render only the complete argument (simpler; the screen appears all at once).
- *Trade-off:* only complete lines are written, and only when the new text extends the old; anything else restarts the parser. A test covers both cases.

**5. Match the host's look** (recommended).
- *Pros:* screens look like part of Claude or ChatGPT; Step 16's tokens make it a mapping, not new styling; still nothing from the model.
- *Cons:* hosts pass different subsets of variables; contrast must hold for any combination.
- *Alternative:* keep the catalog's own look (consistent across hosts, but stands out).
- *Trade-off:* map the standard variables onto tokens, fall back to our defaults for the rest, and keep Step 16's contrast check on the mapped pairs.

**6. A new package, `@omni-ir/mcp`** (recommended).
- *Pros:* `npx @omni-ir/mcp` runs a working server (stdio, or Streamable HTTP); apps import it to add their own tools and pictures; released with the other packages.
- *Cons:* a third package to maintain, with new dependencies: the official MCP SDK and `@modelcontextprotocol/ext-apps` (both MIT, maintained by the MCP project).
- *Alternative:* an example in the repo (no new package, but every app copies it and misses fixes).
- *Trade-off:* one package now saves every adopter the same integration work.

**7. Rules in the spec** (recommended).
- *Pros:* other implementations (a Python MCP server, say) can do the same and stay compatible; the coverage test keeps code and spec together.
- *Cons:* a few more rules in section 10, which follow a young extension that may change.
- *Alternative:* document it as a guide only.
- *Trade-off:* rules like AG-UI's ([10.18]–[10.20]): what the tool takes, how the view writes partial input, what the result reports, that actions go through app-only tools.

## Cost and risk

- **Cost:** none to us at run time: the host's model writes the screens, and the server only checks lines and runs actions. Tests are offline. The manual check in Claude desktop or ChatGPT's developer mode uses the owner's own app.
- **Risk:** MCP Apps is young (January 2026; ext-apps is at 2.0). The bridge pins versions and keeps its rules to the stable core (the resource, the tool link, tool input and result, `tools/call`).
- **Not covered:** native iOS and Android: MCP Apps renders HTML. Our native renderers stay for apps; inside MCP hosts the web catalog draws the screen.

## Task checklist

Work on branch `wip/mcp-apps`. Each part starts with failing tests (constraint 4).

**A. The view** *(tests first)*
- [x] A.1 The single-file view: parser, catalog, CSS and pictures bundled, no network; a size budget
- [x] A.2 Partial and complete tool input written to the parser line by line; restart when the text doesn't extend; tested with a fake host
- [x] A.3 Host theme and variables mapped onto the design tokens; contrast checked

**B. The server** *(tests first)*
- [x] B.1 `show_screen`, the UI resource and its link, the compact guide (token budget tested); the tool result lists rejected lines
- [x] B.2 App-only action tools from the registry, checked by schema, access rule and idempotency key, recorded in the audit trail
- [x] B.3 `@omni-ir/mcp`: stdio and Streamable HTTP, with an app's own tools and pictures; packed and install-tested like the others
- [x] B.4 Who is calling: MCP's authorization (OAuth) mapped to the server's users, so an action from a conversation runs as that person, under their access rules, and is recorded under them in the audit trail
- [x] B.5 Counts of screens shown and actions run, per tool, in the log and `GET /api/health`, so whoever runs the server can see how it's used

**C. Spec, docs and record**
- [x] C.1 SPEC.md section 10, "Over MCP Apps": the rules and their tests; a guide page; CHANGELOG
- [x] C.2 The decision log: this step's entry and decisions

**D. Review and release** *(checkpoint: you review)*
- [x] D.1 A short review page, with screenshots from a fake host; a manual check in Claude desktop or ChatGPT by the owner
  - Manual check passed 2026-10-07: in Claude desktop (`npm run mcp`), Claude called `show_screen` and the booking screen was drawn in the conversation by the view, every line accepted.
- [x] D.2 Merge with your approval
- [x] D.3 Release: a separate go-ahead from you

## What I need from you

Approval of the plan, or changes to any of the seven decisions.
