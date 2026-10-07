# Omni-IR for Android

Native Omni-IR for Android phones and tablets. A model writes flat, line-oriented Omni-IR; these modules parse it as it streams in, check every line against the protocol, and draw it with Jetpack Compose using the **Trusted Catalog**: a fixed set of components that own all styling. The model never writes code, markup or styles.

| Module | What it is | Runs on |
|---|---|---|
| `omni-ir-core` | The parser: line buffer, tokenizer, validation, document. Plain Kotlin, no dependencies. | Any JVM, Android included |
| `omni-ir-runtime` | `OmniStore` (state as `StateFlow`), McpMutation governance, text and date formats, and `OmniClient` for an Omni-IR server. Plain Kotlin and coroutines. | Any JVM, Android included |
| `omni-ir-compose` | `OmniView` and the Compose catalog, with Material 3 from your app's theme. | Android 8.0+ (API 26) |
| `demo` | An app that streams the repo's example screens offline, or asks a running server. | Android |

The parser passes the same [conformance suite](../conformance/README.md) as the TypeScript and Swift implementations (all 98 cases, and the 22 transport cases for its client, with the input split at every chunk size tested), so all three treat every stream identically.

## Install

The modules aren't published to Maven yet. Until they are, include them from this repo (for example as a Git submodule) in your `settings.gradle.kts`:

```kotlin
include(":omni-ir-core", ":omni-ir-runtime", ":omni-ir-compose")
project(":omni-ir-core").projectDir = file("omni-ir/android/omni-ir-core")
project(":omni-ir-runtime").projectDir = file("omni-ir/android/omni-ir-runtime")
project(":omni-ir-compose").projectDir = file("omni-ir/android/omni-ir-compose")
```

and depend on `implementation(project(":omni-ir-compose"))`.

## Usage

```kotlin
import dev.omniir.compose.OmniView
import dev.omniir.core.Primitive
import dev.omniir.core.Tool
import dev.omniir.runtime.OmniStore

// The backend actions a screen may trigger, each checking its own params.
val tools = mapOf(
  "payments.confirm" to Tool { params ->
    val amount = (params["amount"] as? Primitive.Number)?.value ?: 0.0
    if (amount > 0) emptyList() else listOf("amount must be more than 0")
  },
)

@Composable
fun PaymentScreen() {
  val store = remember { OmniStore(tools, assets = setOf("cabin-pines")) }
  OmniView(
    store = store,
    pictures = mapOf("cabin-pines" to painterResource(R.drawable.cabin_pines)),
    onMutation = { call ->
      // Runs only for a Button an McpMutation approved, with params already checked by the tool.
      myBackend.run(call.tool, call.params)
    },
  )
  LaunchedEffect(Unit) {
    // Feed the store from any stream: an LLM, a file, or an Omni-IR server.
    store.write("root = Card([title, pay])\ntitle = Heading(\"Confirm payment\")\n")
    store.write("pay = Button(\"Pay \$42.50\", action=\"pay\")\n")
    store.write("payM = McpMutation(pay, tool=\"payments.confirm\", params={amount: 42.50})\n")
    store.end()
  }
}
```

With a server that implements `POST /api/generate` and `POST /api/mutate`, as the [reference server](../server) does:

```kotlin
val client = OmniClient("https://example.com")
val outcome = client.generate("a payment confirmation for \$42.50", store)
// OmniView(store = store, onMutation = client.mutationHandler())
```

### What the renderer guarantees

- **Only the catalog's components.** Colours, fonts and shapes come from your app's Material 3 theme (light and dark mode, the user's font size); stream text is always plain text.
- **Streaming:** each component keeps its identity by id while more lines arrive. Parts that haven't arrived show a placeholder; parts that never arrive show a small fallback.
- **Governed actions:** a Button with an action stays disabled until an `McpMutation` approves it. A press fills in `$state` params and runs the tool's check before your handler is called; if the check fails, the button stays blocked until a value it used changes.
- **Pictures** come only from the `pictures` you pass, by name. A stream can never load an image from a URL.
- **Rendering can't fail on stream data:** composables only receive validated props, and the sources contain no `!!` (a test in the repo enforces this).
- **Rows that don't fit** (narrow screens, large text) stack vertically instead of squeezing.

## Building and testing

The Gradle wrapper is committed, so a JDK (17 or later) is all you need for the parser and runtime:

```bash
cd android && ./gradlew :omni-ir-core:test :omni-ir-runtime:test
```

`omni-ir-compose` and `demo` need the Android SDK; Gradle includes them only when it finds one (`ANDROID_HOME` or `local.properties`). The `Android demo` GitHub workflow builds the demo, runs its UI tests on an emulator (including an end-to-end run against the Express server), and saves screenshots, a screen recording and an installable APK.
