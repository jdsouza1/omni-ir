// The Omni-IR demo app: pick any screen from the repo's fixtures and watch it stream in, offline, or ask a
// running Omni-IR server. Mock data only: fixture actions are logged with a stub result.
//
// Launch extras (used by the tests and CI screenshots): `fixture` (e.g. "landing/booking") opens a screen
// directly, `appearance` ("light" or "dark"), `instant` ("true" writes the whole screen at once), and
// `server` (e.g. "http://10.0.2.2:8787", the emulator's host) with `prompt` streams from a server.
package dev.omniir.demo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import android.content.res.Configuration
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.omniir.compose.OmniView
import dev.omniir.core.Primitive
import dev.omniir.runtime.GenerateOutcome
import dev.omniir.runtime.OmniClient
import dev.omniir.runtime.OmniStore
import dev.omniir.runtime.RendererEvent
import dev.omniir.runtime.displayText
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val extras = intent.extras
    val start: Source? = extras?.getString("fixture")?.let { Source.Fixture(it) }
      ?: extras?.getString("server")?.let { Source.Server(it, extras.getString("prompt") ?: "book a stay") }
    val appearance = extras?.getString("appearance")
    val instant = extras?.getString("instant") == "true"
    val fixtures = Fixtures.list(this)
    val systemDark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    val dark = when (appearance) {
      "dark" -> true
      "light" -> false
      else -> systemDark
    }
    // Status bar icons that contrast with the page: dark icons on the light theme, light on the dark one.
    val bars = if (dark) SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
    else SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
    enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
    setContent {
      MaterialTheme(colorScheme = if (dark) DarkColors else LightColors) {
        DemoApp(start, instant, fixtures) { Fixtures.read(this, it) }
      }
    }
  }
}

private val LightColors = lightColorScheme(primary = Color(0xFF4F46E5), onPrimary = Color.White)
private val DarkColors = darkColorScheme(primary = Color(0xFFA5B4FC), onPrimary = Color(0xFF1E1B4B))

/** Where a screen comes from: a bundled fixture, or a prompt sent to an Omni-IR server. */
sealed interface Source {
  val title: String

  data class Fixture(val id: String) : Source {
    override val title: String get() = Fixtures.title(id)
  }

  data class Server(val url: String, val prompt: String) : Source {
    override val title: String get() = prompt
  }
}

@Composable
fun DemoApp(start: Source?, instant: Boolean, fixtures: List<String>, read: (String) -> String) {
  var screen by remember { mutableStateOf(start) }
  val current = screen
  // The Surface gives everything inside it the theme's text colour, in light and dark mode.
  Surface(color = MaterialTheme.colorScheme.surfaceContainer, modifier = Modifier.fillMaxSize()) {
    Column(Modifier.windowInsetsPadding(WindowInsets.safeDrawing)) {
      if (current == null) {
        Home(fixtures) { screen = it }
      } else {
        BackHandler { screen = null }
        ScreenView(current, instant, read)
      }
    }
  }
}

@Composable
private fun Home(fixtures: List<String>, open: (Source) -> Unit) {
  var server by rememberSaveable { mutableStateOf("http://10.0.2.2:8787") }
  var prompt by rememberSaveable { mutableStateOf("book a stay") }
  Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Text("Omni-IR", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
    for ((group, items) in Fixtures.grouped(fixtures)) {
      Text(group, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 12.dp))
      for (id in items) {
        Text(
          Fixtures.title(id),
          style = MaterialTheme.typography.bodyLarge,
          modifier = Modifier.fillMaxWidth().clickable { open(Source.Fixture(id)) }.padding(vertical = 10.dp),
        )
        HorizontalDivider()
      }
    }
    Text("Live server", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 12.dp))
    OutlinedTextField(server, { server = it }, label = { Text("Server") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(prompt, { prompt = it }, label = { Text("Describe a screen") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Button(onClick = { open(Source.Server(server, prompt)) }) { Text("Ask the server") }
    Text("Start one with npm run server (free mock model).", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
  }
}

/** One screen, streamed into an OmniView from a fixture or a server. */
@Composable
private fun ScreenView(source: Source, instant: Boolean, read: (String) -> String) {
  val store = remember(source) { OmniStore(DemoRegistries.tools, DemoRegistries.pictureNames) }
  val log = remember(source) { mutableStateListOf<String>() }
  var done by remember(source) { mutableStateOf(false) }
  val issues by store.issues.collectAsState()

  LaunchedEffect(source) {
    when (source) {
      is Source.Fixture -> {
        val text = read(source.id)
        if (instant) {
          store.write(text)
        } else {
          // Small random chunks with short pauses, like a model streaming its reply.
          var rest = text
          while (rest.isNotEmpty()) {
            val size = (4..24).random().coerceAtMost(rest.length)
            store.write(rest.take(size))
            rest = rest.drop(size)
            delay(35)
          }
        }
        store.end()
      }
      is Source.Server -> {
        val outcome = OmniClient(source.url).generate(source.prompt, store)
        if (outcome is GenerateOutcome.Failed) log += "${outcome.code}: ${outcome.message}"
      }
    }
    done = true
  }

  val onMutation: suspend (dev.omniir.runtime.MutationCall) -> Unit = when (source) {
    is Source.Fixture -> { call -> log += "Sent ${call.tool} ${describe(call.params)}: stub result, nothing left the device" }
    is Source.Server -> OmniClient(source.url).mutationHandler { call, result -> log += "Sent ${call.tool} ${describe(call.params)}. Server result: $result" }
  }

  Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
    Text(source.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    OmniView(
      store = store,
      pictures = DemoRegistries.pictures(),
      onMutation = onMutation,
      onEvent = { event ->
        when (event) {
          is RendererEvent.Press -> log += "Pressed ${event.id} (local only)"
          is RendererEvent.Error -> log += "${event.issue.code.wireName}: ${event.issue.message}"
        }
      },
    )
    if (log.isNotEmpty()) Section("Actions", log)
    if (issues.isNotEmpty()) Section("Issues", issues.map { "${it.line?.let { l -> "Line $l" } ?: "End"}: ${it.code.wireName}" })
    Text(
      if (done) "Done" else "Streaming…",
      style = MaterialTheme.typography.bodySmall,
      color = MaterialTheme.colorScheme.onSurfaceVariant,
      modifier = Modifier.testTag("status"),
    )
  }
}

@Composable
private fun Section(title: String, lines: List<String>) {
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
    for (line in lines) Text(line, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
  }
}

private fun describe(params: Map<String, Primitive>): String =
  params.keys.sorted().joinToString(", ", "{", "}") { key ->
    when (val v = params[key]) {
      is Primitive.Text -> "$key: \"${v.value}\""
      null -> key
      else -> "$key: ${displayText(v)}"
    }
  }

/** Pictures by the names streams use, from the vector drawables generated from app/assets.ts. */
object DemoRegistries {
  val pictureNames = setOf("cabin-pines", "shirt", "tote")

  @Composable
  fun pictures() = mapOf(
    "cabin-pines" to painterResource(R.drawable.omni_cabin_pines),
    "shirt" to painterResource(R.drawable.omni_shirt),
    "tote" to painterResource(R.drawable.omni_tote),
  )

  val tools = DemoTools.registry
}
