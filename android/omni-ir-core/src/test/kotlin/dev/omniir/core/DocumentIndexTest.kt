// The incremental document checks (PLAN-HARDENING.md C.2) must report exactly what the whole-document
// check reports: compared on every line of every fuzz corpus stream and every fixture.
package dev.omniir.core

import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Test

private val repoRoot = File(System.getProperty("omniir.repoRoot") ?: "..")
private val tools: ToolRegistry = listOf(
  "payments.confirm", "auth.sendMagicLink", "profile.update", "orders.requestReturn",
  "support.createTicket", "bookings.reserve", "assistant.ask", "settings.update",
).associateWith { Tool.acceptsAnything }
private val assets = setOf("cabin-pines", "shirt", "tote")

class DocumentIndexTest {
  private fun key(issues: List<Issue>) = issues.map { "${it.code.wireName}:${it.id ?: ""}" }.toSortedSet()

  private fun compare(text: String) {
    val index = DocumentIndex()
    val accepted = mutableListOf<Statement>()
    for (line in text.split("\r\n", "\r", "\n")) {
      val parsed = parseLine(line) as? LineResult.Statement ?: continue
      val ok = validateStatement(parsed.statement, tools, assets) as? StatementResult.Ok ?: continue
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
