# Forms and confirmations

A screen can say that a field is required, or that it holds an email address, and the renderer checks it before anything is sent. Your app can ask the person to confirm an action in its own words. Neither gives the model any new power: the stream only declares what a field expects, and confirmations come only from your app.

## Fields that check themselves

Since stream format 0.8, a field can carry constraints:

```
$email = ""
email = Input($email, label="Email address", required=true, format="email")
$message = ""
message = Input($message, label="Message", required=true, maxLength=2000, lines=4)
$plan = ""
plan = Select($plan, label="Plan", options=["Monthly", "Yearly"], required=true)
$terms = false
terms = Switch($terms, label="I accept the terms", required=true)
```

| Prop | On | Checks |
|---|---|---|
| `required=true` | Input, DateInput, Select, Switch | Not empty; for a Select, one of its options; for a Switch, on |
| `format` | Input | `"email"`, `"number"`, `"phone"` or `"url"` |
| `minLength`, `maxLength` | Input | Length in characters (1 to 2,000) |
| `min`, `max` | DateInput | Already there: no earlier or later date |

When a person presses a governed Button, the renderer first checks every field its `McpMutation`'s params read. If one fails, nothing is sent: its message appears under it, and focus moves to it. A message also appears once the person leaves a field, never while they're still typing, and it is announced to screen readers. A field that no action reads can still show a message, but it blocks nothing.

The messages are the renderer's own words ("This is required.", "Enter an email address, like name@example.com."), never text from the stream. Replace them like any of the renderer's words: see [Themes and wording](./themes.md).

**The checks are for people, not for security.** They save a round trip and help the person fix a mistake. Your backend still checks every action's params against the tool's own schema, as before.

The same rules run on the web, iPhone and Android, held to one set of shared cases (`conformance/fields/fields.json`). SPEC.md section 8, Fields, has them in full.

## Confirmations, in your app's words

Give the renderer a sentence for each tool whose actions need the person's say-so:

```tsx
<OmniRenderer
  store={parser.store}
  tools={tools}
  confirm={{ "payments.confirm": "Pay {amount}?" }}
  onMutation={…}
/>
```

```swift
let store = OmniStore(tools: tools, confirm: ["payments.confirm": "Pay {amount}?"])
```

```kotlin
val store = OmniStore(tools, confirm = mapOf("payments.confirm" to Confirmation.template("Pay {amount}?")))
```

Pressing a governed Button for that tool opens the renderer's own dialog with your sentence, a Cancel and a Confirm. Each `{name}` is filled once with that param's value as plain text, so nothing in a value is read as a placeholder or markup. The action runs only on Confirm.

A sentence shows values as they are ("Pay 42.5?"). To format them, for example an amount as currency, give a function that writes the sentence from the params, once they've passed the tool's check. Its result is still shown as plain text:

```tsx
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const confirm = { "payments.confirm": (p) => `Pay ${usd.format(Number(p.amount))}?` }; // "Pay $42.50?"
```

```swift
let confirm: [String: Confirmation] = [
  "payments.confirm": Confirmation { params in
    guard case .number(let amount)? = params["amount"] else { return "Pay now?" }
    return "Pay \(amount.formatted(.currency(code: "USD")))?"
  }
]
```

```kotlin
val usd = NumberFormat.getCurrencyInstance(Locale.US)
val confirm = mapOf("payments.confirm" to Confirmation { p -> "Pay ${usd.format((p["amount"] as? Primitive.Number)?.value ?: 0.0)}?" })
```

If the function fails, nothing runs, and the failure is reported like a failed handler.

A press runs its checks in this order, and stops at the first that fails: the fields its params read, the params against the tool's schema, then the confirmation. Only then is your handler called.

A stream can't skip, change or add a confirmation: there is no prop or line for it. A "confirmation" the model draws is just part of the screen. Like field checks, confirmations protect the person from slips and misleading screens; the backend stays the security boundary.

## Screens as text

`describeScreen(document)` in `@omni-ir/core` turns a screen into a plain-text outline, one component per line:

```
Card
  Heading: Sign in
  Input: Email address (required, email)
  Button: Email me a link (action: auth.sendMagicLink)
```

What the person typed stays out unless you ask (`describeScreen(document, { values: true })`), so it doesn't reach a model or a log by accident. The [MCP bridge](./mcp.md) adds the outline to `show_screen`'s result, for hosts that can't draw the view.

## Older apps

Stream format 0.8 added these props. A server writing format 0.8 answers a client that asks for 0.5 to 0.7 with `unsupported_version` (SPEC.md [10.12]). Apps from release 0.8.0 to 0.10.x then retry once without a version, so they still get the screen: they show the update notice, and a field that uses a new prop shows a fallback while the rest of the screen works. Apps from releases 0.6 and 0.7 don't retry, so they need an update. Update your apps along with your server.
