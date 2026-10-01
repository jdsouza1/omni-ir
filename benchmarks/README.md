# Format comparison benchmark

How Omni-IR compares in size and streaming with other ways a model can describe a screen. The results and caveats are in [docs/COMPARISON.md](../docs/COMPARISON.md); the plan is [PLAN-COMPARISON.md](../PLAN-COMPARISON.md).

```bash
npm run bench              # convert, measure, write out/ and results.json
npm run bench -- --check   # fail if anything committed is out of date (the tests run this)
```

Offline and free: no model or API is called. Tokens are counted with `tiktoken`'s GPT-5 encoding (`o200k_base`), the counter OpenUI's benchmark uses.

## Method

**Same screen, different syntax.** Every screen is read into one neutral structure (`src/tree.ts`), and every format is written from it by a script (`src/emit.ts`, `src/html.ts`). The components and props stay the same in every format; only the syntax changes. OpenUI's benchmark works the same way (it writes its own components into json-render and YAML). So the size numbers compare syntax, not component libraries. Which screens each library can draw at all is a separate question, answered in docs/COMPARISON.md.

**Two screen sets:**
- `screens/omni/`: the nine replies from the first model check (`docs/model-check-2026-10-01.md`), written by a model in Omni-IR. A test checks that they match the record and are valid.
- `sources/openui/samples/*.oui`: the seven scenarios OpenUI publishes with its benchmark, written in OpenUI Lang.

**Each format in its own idiom:**

| Format | Written as |
|---|---|
| Omni-IR | One flat statement per line; the catalog's positional props first, the rest named; nested components on their own lines; `$state`; a governed Button wrapped by `McpMutation` |
| OpenUI Lang | Positional arguments in the documented order (skipped ones as `null`); inline components stay inline; `$variables`; `Mutation(...)` run by `Action([@Run(...)])` |
| A2UI v0.9 | JSON Lines: `createSurface`, `updateDataModel`, `updateComponents`; a flat component list with child ids; state as `{"path": "/key"}`; actions as `{"event": {...}}`. Measured twice: all components in one message (as most examples do), and one message per component (streamed) |
| json-render | JSON Patch lines building `{root, elements, state}`; inputs `{"$bindState"}`, read-only values `{"$state"}`, a governed button `on.press` |
| HTML + Tailwind | Markup and classes a model would write to style the screen itself (model-check set only: OpenUI's charts and tables have no fair HTML template) |
| React JSX | A component using the same component library, `useState` for state, `callTool(...)` on press |

**Checks** (`tests/benchmarks.test.ts`):
- The Omni-IR and OpenUI Lang outputs read back as the same screen; the Omni-IR outputs of the model-check screens are valid with the real parser, tools and assets.
- Reading OpenUI's seven scenarios and writing them as OpenUI's own converter does reproduces its published json-render files byte for byte (the token counts match its table exactly).
- Every A2UI message validates against A2UI's published message schema (v0.9.1); json-render outputs build the whole screen.
- OpenUI's own parser (`@openuidev/lang-core` 0.3.0) accepts all 16 OpenUI Lang outputs: `checks/openui-parser.mjs`, run by hand because that package sends install telemetry and is not a dependency here.

**Streaming:** a component can be drawn once it and every component above it have fully arrived (a complete line for Omni-IR, OpenUI Lang and json-render; a complete message for A2UI; its own text for HTML; the whole module for JSX, which must compile). Layout containers don't count as content. The results give the tokens, and the share of the reply, needed before the first content and before half of it can be drawn.

## Sources (pinned)

| Folder | What | Version | Licence |
|---|---|---|---|
| `sources/openui/` | OpenUI's benchmark samples, `schema.json` and system prompt | thesysdev/openui `97e8335` | MIT |
| `sources/a2ui/` | A2UI v0.9.1 spec (message schema, common types, basic catalog, examples) | a2ui-project/a2ui `5cd37f4` | Apache-2.0 |
| `sources/json-render/` | json-render README and core types, for its spec and patch format | vercel-labs/json-render `fc2a696` | Apache-2.0 |

Each folder keeps the project's licence and a `COMMIT` file. These files are only read by the benchmark, never shipped.

`out/` and `results.json` are generated; don't edit them by hand.
