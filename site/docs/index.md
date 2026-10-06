---
layout: home

hero:
  name: Omni-IR
  text: An open standard for generative UI
  tagline: AI models write short, flat lines of intent. Your app checks every line and draws it with its own trusted components. No HTML, no CSS, no code from the model, and no action it wasn't allowed.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Read the spec
      link: /spec

features:
  - title: Streams line by line
    details: Each line is parsed and drawn as soon as it arrives, so a screen starts to appear after about 30 tokens. Parts still on their way show placeholders.
  - title: Governed actions
    details: A button that changes data stays disabled until an McpMutation names a tool from your registry, and its params are checked by the parser, the client and the server.
  - title: One spec, three platforms
    details: TypeScript, Swift and Kotlin parsers pass the same 81 conformance cases. Native renderers for React, SwiftUI and Jetpack Compose.
  - title: Data, not pixels
    details: The model sends titles, labels and values. Colours, fonts, spacing and animation always belong to your app.
---

```
root = Card([title, amount, pay])
title = Heading("Confirm payment")
amount = Text(42.50, format="currency", currency="USD")
pay = Button("Pay now", action="pay")
payM = McpMutation(pay, tool="payments.confirm", params={amount: 42.50})
```
