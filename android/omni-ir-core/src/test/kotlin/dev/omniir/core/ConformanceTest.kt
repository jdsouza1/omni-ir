// Runs the language-neutral conformance suite (conformance/cases/*.json) against the Kotlin parser,
// following conformance/README.md: issues as distinct {line, code} pairs, the other parts only when
// a case lists them, and the same result however the input bytes are split.
package dev.omniir.core

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private val repoRoot = File(System.getProperty("omniir.repoRoot") ?: "..")

/** A JSON value in plain Kotlin form; every number is a Double, so 1 and 1.0 compare equal. */
private fun plain(e: JsonElement): Any? = when (e) {
  is JsonNull -> null
  is JsonPrimitive -> if (e.isString) e.content else e.booleanOrNull ?: e.doubleOrNull
  is JsonArray -> e.map(::plain)
  is JsonObject -> e.mapValues { plain(it.value) }
}

private data class ExpectedIssue(val line: Int?, val code: String) {
  override fun toString(): String = "${line ?: "end"}:$code"
}

private class Case(val json: JsonObject) {
  val id: String = json.getValue("id").jsonPrimitive.content
  val tools: List<String> = json["tools"]?.jsonArray?.map { it.jsonPrimitive.content } ?: listOf("payments.confirm")
  val assets: Set<String> = json["assets"]?.jsonArray?.map { it.jsonPrimitive.content }?.toSet() ?: emptySet()
  val expect: JsonObject = json.getValue("expect").jsonObject

  /** The stream: a string, or parts joined in order, where {repeat, times} is a long run of text. */
  val text: String = when (val input = json.getValue("input")) {
    is JsonPrimitive -> input.content
    is JsonArray -> input.joinToString("") { part ->
      if (part is JsonPrimitive) part.content
      else part.jsonObject.getValue("repeat").jsonPrimitive.content.repeat(part.jsonObject.getValue("times").jsonPrimitive.intOrNull ?: 0)
    }
    else -> error("bad input in $id")
  }
}

private fun loadCases(): List<Case> {
  val dir = File(repoRoot, "conformance/cases")
  return dir.listFiles { f -> f.name.endsWith(".json") }.orEmpty().sortedBy { it.name }.flatMap { file ->
    Json.parseToJsonElement(file.readText()).jsonObject.getValue("cases").jsonArray.map { Case(it.jsonObject) }
  }
}

private data class Canonical(
  val issues: Set<ExpectedIssue>,
  val nodes: Map<String, Any?>,
  val state: Map<String, Any?>,
  val mutations: Map<String, Any?>,
  val missing: List<String>,
)

private fun plain(p: Primitive): Any? = when (p) {
  is Primitive.Text -> p.value
  is Primitive.Number -> p.value
  is Primitive.Bool -> p.value
  Primitive.Null -> null
}

private fun plain(v: PropValue): Any? = when (v) {
  is PropValue.Text -> v.value
  is PropValue.Number -> v.value
  is PropValue.Bool -> v.value
  PropValue.Null -> null
  is PropValue.State -> mapOf("state" to v.key)
  is PropValue.Ref -> v.id
  is PropValue.Record -> v.entries.mapValues { plain(it.value) }
}

private fun run(case: Case, chunkSize: Int?): Canonical {
  val parser = OmniParser(case.tools.associateWith { Tool.acceptsAnything }, case.assets)
  if (chunkSize == null) {
    parser.write(case.text)
  } else {
    val bytes = case.text.toByteArray(Charsets.UTF_8)
    for (at in bytes.indices step chunkSize) parser.write(bytes.copyOfRange(at, minOf(at + chunkSize, bytes.size)))
  }
  parser.end()
  val doc = parser.document
  return Canonical(
    issues = parser.issues.map { ExpectedIssue(it.line, it.code.wireName) }.toSet(),
    nodes = doc.nodes.mapValues { (_, n) -> mapOf("type" to n.type.wireName, "props" to n.props.mapValues { plain(it.value) }, "children" to n.children) },
    state = doc.state.mapValues { plain(it.value) },
    mutations = doc.mutations.mapValues { (_, m) -> mapOf("id" to m.id, "tool" to m.tool, "params" to m.params.mapValues { plain(it.value) }) },
    missing = doc.missing.sorted(),
  )
}

class ConformanceTest {
  @Test
  fun `loads every case file`() {
    val cases = loadCases()
    assertTrue(cases.size >= 60, "found ${cases.size} cases")
    assertEquals(cases.size, cases.map { it.id }.toSet().size, "case ids are unique")
  }

  @TestFactory
  fun `gives the expected result, the same for every chunking`(): List<DynamicTest> = loadCases().map { case ->
    DynamicTest.dynamicTest(case.id) {
      val whole = run(case, null)
      for (size in listOf(1, 5, 13)) assertEquals(whole, run(case, size), "${case.id}: chunks of $size bytes")
      val expected = case.expect.getValue("issues").jsonArray.map {
        ExpectedIssue(it.jsonObject["line"]?.jsonPrimitive?.intOrNull, it.jsonObject.getValue("code").jsonPrimitive.content)
      }.toSet()
      assertEquals(expected, whole.issues, "${case.id}: issues")
      case.expect["nodes"]?.let { assertEquals(plain(it), whole.nodes, "${case.id}: nodes") }
      case.expect["state"]?.let { assertEquals(plain(it), whole.state, "${case.id}: state") }
      case.expect["mutations"]?.let { assertEquals(plain(it), whole.mutations, "${case.id}: mutations") }
      case.expect["missing"]?.let { assertEquals(plain(it), whole.missing, "${case.id}: missing") }
    }
  }
}
