// The incremental document checks (PLAN-HARDENING.md C.2) must report exactly what the whole-document
// check reports: compared on every line of every fuzz corpus stream and every fixture.
package dev.omniir.core

import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test

private val repoRoot = File(System.getProperty("omniir.repoRoot") ?: "..")
private val tools: ToolRegistry = listOf(
  "payments.confirm", "auth.sendMagicLink", "profile.update", "orders.requestReturn",
  "support.createTicket", "bookings.reserve", "assistant.ask", "settings.update", "cart.add",
).associateWith { Tool.acceptsAnything }
private val assets = setOf("cabin-pines", "shirt", "tote")

/** JSON as maps, lists, text, numbers and booleans. */
private fun plainJson(e: JsonElement): Any? = when (e) {
  is JsonPrimitive -> if (e.isString) e.content else e.booleanOrNull ?: e.doubleOrNull
  is JsonArray -> e.map(::plainJson)
  is JsonObject -> e.mapValues { plainJson(it.value) }
}

class DocumentIndexTest {
  private fun key(issues: List<Issue>) = issues.map { "${it.code.wireName}:${it.id ?: ""}" }.toSortedSet()

  private var components = AppComponents.NONE
  private var pictures = emptyList<PicturePattern>()

  private fun compare(text: String) {
    val index = DocumentIndex()
    val accepted = mutableListOf<Statement>()
    for (line in text.split("\r\n", "\r", "\n")) {
      val parsed = parseLine(line) as? LineResult.Statement ?: continue
      val ok = validateStatement(parsed.statement, tools, assets, components, pictures) as? StatementResult.Ok ?: continue
      val whole = validateDocument(accepted + ok.statement, complete = false)
      assertEquals(key(whole), key(index.check(ok.statement)), line)
      if (whole.isEmpty()) {
        accepted += ok.statement
        index.add(ok.statement)
      }
    }
  }

  @Test
  fun `agrees with validateDocument on every corpus stream and fixture`() {
    var streams = 0
    val corpus = Json.parseToJsonElement(File(repoRoot, "fuzz/corpus.json").readText()).jsonObject.getValue("cases").jsonArray
    // The demo app's own components (Step 20), as the corpus carries them.
    val first = corpus.first().jsonObject
    components = appComponentsFromJsonValue(plainJson(first.getValue("components")) as Map<*, *>)
    pictures = picturePatternsFromJsonValue(plainJson(first.getValue("pictures")) as List<*>)
    for (case in corpus) {
      compare(case.jsonObject.getValue("input").jsonPrimitive.content)
      streams++
    }
    for (file in File(repoRoot, "fixtures").walkTopDown().filter { it.isFile && it.name.endsWith(".omni") }) {
      compare(file.readText())
      streams++
    }
    assertTrue(streams > 2000, "compared $streams streams")
  }
}
