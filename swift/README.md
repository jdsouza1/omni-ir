# Omni-IR for Swift

Native Omni-IR for iPhone, iPad and Mac. A model writes flat, line-oriented Omni-IR; this package parses it as it streams in, checks every line against the protocol, and draws it with SwiftUI using the **Trusted Catalog**: a fixed set of components that own all styling. The model never writes code, markup or styles.

| Library | What it is | Platforms |
|---|---|---|
| `OmniIRCore` | The parser: line buffer, tokenizer, validation, document. Foundation only. | iOS, macOS, Linux, Windows |
| `OmniIRSwiftUI` | `OmniView` (the renderer), `OmniStore`, McpMutation governance, and `OmniClient` for an Omni-IR server. | iOS 17+, macOS 14+ |

The parser passes the same [conformance suite](../conformance/README.md) as the TypeScript implementation (all 98 cases, and the 22 transport cases for its client, with the input split at every chunk size tested), so both treat every stream identically.

## Install

In Xcode: **File → Add Package Dependencies…**, enter `https://github.com/jdsouza1/omni-ir`, and add `OmniIRSwiftUI` to your app. In a `Package.swift`:

```swift
.package(url: "https://github.com/jdsouza1/omni-ir", from: "0.9.0")
```

`0.2.0` was the first release to include the Swift package (the `v0.1.0` tag predates it); `0.3.0` added the charts, `0.4.0` the nesting and size limits, `0.5.0` the transport standard and stream versions, `0.6.0` the token setting and idempotency keys for real actions, `0.7.0` the shared colours and replaceable words (`OmniPalette`, `OmniStrings`, `.omniStrings`), `0.8.0` the stream format's own version (`omniIRFormatVersion`), `0.9.0` the model check's `model_unverified` code, reported like any retryable error. An app works with any server that writes its stream format or an older one; the format is `0.5` from `0.5.0` to `0.9.0`.

## Usage

```swift
import OmniIRSwiftUI
import SwiftUI

// The backend actions a screen may trigger, each checking its own params.
let tools: ToolRegistry = [
  "payments.confirm": Tool { params in
    if case .number(let amount)? = params["amount"], amount > 0 { return [] }
    return ["amount must be more than 0"]
  },
]

struct PaymentScreen: View {
  @State private var store = OmniStore(tools: tools, assets: ["cabin-pines"])

  var body: some View {
    OmniView(
      store: store,
      pictures: ["cabin-pines": Image("cabin-pines")],
      onMutation: { call in
        // Runs only for a Button an McpMutation approved, with params already checked by the tool.
        try await myBackend.run(call.tool, call.params)
      }
    )
    .task {
      // Feed the store from any stream: an LLM, a file, or an Omni-IR server.
      store.write("root = Card([title, pay])\ntitle = Heading(\"Confirm payment\")\n")
      store.write("pay = Button(\"Pay $42.50\", action=\"pay\")\n")
      store.write("payM = McpMutation(pay, tool=\"payments.confirm\", params={amount: 42.50})\n")
      store.end()
    }
  }
}
```

With a server that implements `POST /api/generate` and `POST /api/mutate`, as the [reference server](../server) does:

```swift
let client = OmniClient(baseURL: URL(string: "https://example.com")!)
let outcome = await client.generate("a payment confirmation for $42.50", into: store)
// OmniView(store: store, onMutation: client.mutationHandler())
```

### What the renderer guarantees

- **Only the catalog's components.** Colours, fonts and layout come from the system (light and dark mode, Dynamic Type); stream text is always plain text, never Markdown.
- **Streaming:** each component keeps its identity by id while more lines arrive. Parts that haven't arrived show a placeholder; parts that never arrive show a small fallback.
- **Governed actions:** a Button with an action stays disabled until an `McpMutation` approves it. A press fills in `$state` params and runs the tool's check before your handler is called; if the check fails, the button stays blocked until a value it used changes.
- **Pictures** come only from the `pictures` you pass, by name. A stream can never load an image from a URL.
- **Rendering can't fail on stream data:** views only receive validated props, and the sources contain no forced unwraps (a test in the repo enforces this).

## Demo app

`swift/Demo` is an iOS app that streams any of the repo's example screens offline, or asks a running server (`npm run server`, free mock model). Generate its Xcode project with [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```bash
brew install xcodegen
cd swift/Demo && xcodegen generate && open OmniIRDemo.xcodeproj
```

## Tests

`swift test` runs the conformance suite, the parser tests and the renderer model tests on any platform. The `iOS demo` GitHub workflow builds the demo app, runs its UI tests in the iPhone simulator (including an end-to-end run against the Express server), and saves screenshots and a screen recording.
