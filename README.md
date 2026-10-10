# Omni-IR

**A line-oriented streaming protocol for generative UI.** An AI model describes a screen in short, flat lines of Omni-IR; a trusted client parses each line as it streams in and renders it with its own components. The model never writes HTML, CSS or code, and can only trigger backend actions the app has explicitly allowed.

> **Status: early (v0.10).** The parser, schema, streaming server and playground work and are tested, with renderers for the web (React), iPhone and iPad (SwiftUI) and Android (Jetpack Compose). The format is defined in [SPEC.md](SPEC.md), with a [conformance suite](conformance/README.md) that all three parsers pass. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

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

`root` comes first, so the card appears immediately and its parts fill in as their lines arrive. `confirm` has an `action`, so it only becomes clickable once its `McpMutation` line names a permitted tool. `cancel` has none, so it can never reach the server.

**Website:** [jdsouza1.github.io/omni-ir](https://jdsouza1.github.io/omni-ir/) · [Try the playground](https://jdsouza1.github.io/omni-ir/playground/) (runs in your browser, free) · [Docs](https://jdsouza1.github.io/omni-ir/docs/) · [Discussions](https://github.com/jdsouza1/omni-ir/discussions)

## Use it in your app

```bash
npm install @omni-ir/core @omni-ir/react
```

[`@omni-ir/core`](https://www.npmjs.com/package/@omni-ir/core) parses and validates a stream; [`@omni-ir/react`](https://www.npmjs.com/package/@omni-ir/react) renders it with the Trusted Catalog. Not on React? [`@omni-ir/elements`](https://www.npmjs.com/package/@omni-ir/elements) gives you `<omni-screen>` for Vue, Svelte, Angular or plain HTML. Their READMEs have examples.

**iPhone, iPad and Mac (SwiftUI):** add the package `https://github.com/jdsouza1/omni-ir` with Swift Package Manager and use `OmniIRSwiftUI` (iOS 17+, macOS 14+). See [swift/README.md](swift/README.md).

**Android (Jetpack Compose):** `omni-ir-compose` in [`android/`](android/README.md) (Android 8.0+). It isn't published to Maven yet; until it is, include the modules from this repo.

All three parsers (TypeScript, Swift and Kotlin) pass the same [conformance suite](conformance/README.md), so a stream behaves identically everywhere. How a screen travels from a server to an app is specified too, with transport cases for the three clients, and screens can also travel over [AG-UI](https://docs.ag-ui.com/), the event protocol many agent frameworks speak (`@omni-ir/core/ag-ui`).

## Try it locally

Requires Node.js 22.22+ or 24.15+.

```bash
npm install
npm run playground
```

Open http://localhost:5173, then pick an example or describe a screen. The playground uses a **mock model** that streams pre-written screens, so it needs no API key and costs nothing. Try the `demo: …` prompts to see how errors are handled.

| Command | What it does |
|---|---|
| `npm test` | Raw-HTML guard and all tests (no network) |
| `npm run typecheck` | TypeScript, strict |
| `npm run playground` | The Interactive Playground with the API, on :5173 |
| `npm run playground:static` | The playground as static files, with the API running in the browser (the hosted version) |
| `npm run server` | The API server alone, on :8787 |
| `npm run demo` | Stream a fixture in the terminal; `-- --server "prompt"` streams from the running server |
| `npm run validate -- file.omni` | Check Omni-IR (e.g. a model's reply): errors by line, then the rendered HTML |
| `npm run prompt:print` | Print the system prompt a real model would get |
| `npm run spec` | Regenerate the generated sections of SPEC.md from the schema |

## How it works

Diagram and step-by-step walkthrough: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
model text ──► /api/generate (SSE) ──► line buffer ──► tokenizer ──► schema ──► store ──► React renderer
                                        (bytes→lines)   (text→AST)  (Zod rules) (snapshots) (Trusted Catalog)
button click ──► McpMutationBoundary ──► /api/mutate ──► server re-validates ──► tool handler
```

- **Streaming:** network chunks are split into complete lines (multi-byte characters and `\r\n` handled), and each line is parsed as soon as it arrives. A reference to a line that hasn't arrived yet renders as a placeholder; if it never arrives, it becomes a small "failed to load" box instead of collapsing the layout.
- **Bad lines never stop the stream:** an invalid line is reported with its line number and skipped.
- **Stable rendering:** every component is keyed by its Omni-IR id, and only the component whose line just arrived re-renders.

## Security model

- **No code, markup or styling from the model.** The grammar is flat assignments only, and all text is rendered as text. A build-time guard fails on `innerHTML`, `dangerouslySetInnerHTML`, `eval` or `new Function`.
- **A fixed component catalog.** The schema rejects unknown components and unknown or free-form props (`style`, `className`, HTML attributes). Every visual option is a fixed set of values.
- **Governed actions.** A button that changes backend state must be wrapped by an `McpMutation` naming a tool from the app's registry. Until then it is disabled.
- **Checked three times:** the parser rejects unknown tools, the browser validates params against the tool's schema before sending, and the server re-validates both before running anything. The server doesn't trust the browser.
- **Contained failures.** A component that crashes shows a fallback; the rest of the screen keeps working. (In SwiftUI, which can't catch a failing view, components only ever receive validated props, so rendering can't fail.)
- **Real actions are authorized.** The reference server signs people in by emailed link, gives every tool an access rule, checks ownership against its own data, and uses idempotency keys so no action runs twice. Validation proves a request is well-formed; these prove it is allowed.

## How it compares

The same screens in each format; sizes are counted offline the way OpenUI's benchmark counts them, and validity was checked in fresh Claude.ai chats ([docs/COMPARISON.md](docs/COMPARISON.md); sizes reproduce with `npm run bench`):

- **Compact:** on the nine model-check screens, Omni-IR uses 39% fewer tokens than A2UI, 55% fewer than json-render, 50% fewer than HTML with Tailwind and 18% fewer than React JSX. OpenUI Lang, the closest relative, is 4–10% smaller still: it allows positional arguments and components nested inside other components.
- **Streams line by line:** the first content can be drawn after about 30–40 tokens. A2UI sent as one message, and generated React code, show nothing until the reply is complete.
- **Tighter control than the alternatives:** no logic in the stream, pictures only from the app's registry, every data-changing action governed with its params checked, a 98-case conformance suite (plus 22 transport cases), and native web, iOS and Android renderers that pass it.
- **A smaller catalog:** 27 components against OpenUI's 53. Tables, dropdowns, switches, tabs and notices arrived in Step 10, bar, line and pie charts in Step 11; Omni-IR now draws 5 of OpenUI's 7 benchmark scenarios.
- **Reliable, and safer when asked for something risky:** in fresh Claude.ai chats, Claude wrote both Omni-IR and OpenUI Lang validly on the first try for 9 of 9 requests. Asked for a button that permanently deletes the account, with no tool for it, Omni-IR left the button unwired and said so, while the OpenUI Lang reply wired it to an invented action.

## Components

`Stack`, `Card`, `Heading`, `Text`, `Input` (one line, or several with `lines`), `DateInput`, `Select`, `Switch`, `Button`, `Divider`, `Badge`, `Notice`, `Skeleton`, `Image`, `Rating`, `List`, `ListItem`, `Table`, `TableRow`, `Tabs`, `Tab`, `Message`, `BarChart`, `LineChart`, `PieChart`, `Series`, `Slice`, plus `McpMutation` for governed actions. Select, Switch, Table, Tabs and Notice are new in 0.2.0, the charts in 0.3.0. Charts carry data only: the model sends a title, labels and numbers, and each renderer chooses the colours, legend and readouts. Images come only from the app's asset registry (`app/assets.ts`), named by the model, never as URLs. `npm run prompt:print` shows every prop and allowed value, generated from the schema.

## Using a real model (optional, costs money)

The server includes a Claude adapter that is **off by default**. It runs only if you set `OMNI_MODEL=claude` and provide Anthropic API credentials, and each request is billed by Anthropic. A daily cap (`OMNI_DAILY_CAP`, default 50) limits generations. Everything else in this repo, including CI, uses the free mock model.

To check how well a model follows the protocol without paying for API calls, paste the output of `npm run prompt:print` into a Claude.ai chat, save its replies to files, and run `npm run validate` on them.

## Project layout

| Folder | Contents |
|---|---|
| `packages/core/` | `@omni-ir/core`: line buffer, tokenizer, parser, store; `schema.ts` is the single authority on the protocol |
| `packages/react/` | `@omni-ir/react`: the Trusted Catalog components, `OmniRenderer` and browser helpers |
| `packages/elements/` | `@omni-ir/elements`: `<omni-screen>`, the React renderer on Preact in a custom element, for any web framework |
| `examples/` | `<omni-screen>` in plain HTML, Vue, Svelte and Angular, checked in a browser in CI |
| `packages/mcp/` | `@omni-ir/mcp`: Omni-IR screens in MCP Apps hosts (Claude, ChatGPT, VS Code, Cursor): an MCP server and a view built from the parser and catalog |
| `server/` | Express SSE server, mock and Claude models |
| `playground/` | The Interactive Playground |
| `app/` | The tool registry and image asset registry shared by browser and server |
| `Package.swift`, `swift/` | The Swift package: `OmniIRCore` (parser) and `OmniIRSwiftUI` (renderer and client), plus the iOS demo app |
| `android/` | Kotlin: `omni-ir-core` (parser), `omni-ir-runtime` (store, governance, client), `omni-ir-compose` (Compose catalog), plus the Android demo app |
| `site/` | The public site: landing page and docs (`npm run site:build`) |
| `fixtures/` | Example screens and failure cases |

The format is specified in [SPEC.md](SPEC.md). Design decisions and build history are in [PLAN.md](PLAN.md), [PLAN-SERVER.md](PLAN-SERVER.md), [PLAN-PLAYGROUND.md](PLAN-PLAYGROUND.md), [PLAN-SPEC.md](PLAN-SPEC.md), [PLAN-COMPONENTS.md](PLAN-COMPONENTS.md), [PLAN-NPM.md](PLAN-NPM.md), [PLAN-IOS.md](PLAN-IOS.md), [PLAN-ANDROID.md](PLAN-ANDROID.md), [PLAN-CATALOG.md](PLAN-CATALOG.md) and [PLAN-CHARTS.md](PLAN-CHARTS.md).

## Roadmap

What is done and what is planned, with dates: [docs/ROADMAP.md](docs/ROADMAP.md).

- Bi-directional AST sync tooling

## Contributing

Contributions are welcome: bugs, spec proposals, new components, other implementations and docs. Start with [CONTRIBUTING.md](CONTRIBUTING.md). How the spec changes and who decides: [GOVERNANCE.md](GOVERNANCE.md). Please follow the [code of conduct](CODE_OF_CONDUCT.md), and report security problems privately as described in [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
