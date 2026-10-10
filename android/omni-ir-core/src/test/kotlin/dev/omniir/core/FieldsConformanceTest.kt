// Runs the field-check conformance cases (conformance/fields/fields.json, SPEC.md section 8, Fields)
// against the Kotlin checks: the same file the web and Swift renderers are held to.
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
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private val repoRoot = File(System.getProperty("omniir.repoRoot") ?: "..")

private fun propValue(e: JsonElement): PropValue = when {
  e is JsonNull -> PropValue.Null
  e is JsonArray -> PropValue.ListOf(e.map(::propValue))
  e is JsonPrimitive && e.isString -> PropValue.Text(e.content)
  e is JsonPrimitive && e.booleanOrNull != null -> PropValue.Bool(e.booleanOrNull == true)
  e is JsonPrimitive -> PropValue.Number(e.doubleOrNull ?: error("bad number $e"))
  else -> error("unexpected prop $e")
}

private fun primitive(e: JsonElement): Primitive = when {
  e is JsonNull -> Primitive.Null
  e is JsonPrimitive && e.isString -> Primitive.Text(e.content)
  e is JsonPrimitive && e.booleanOrNull != null -> Primitive.Bool(e.booleanOrNull == true)
  e is JsonPrimitive -> Primitive.Number(e.doubleOrNull ?: error("bad number $e"))
  else -> error("unexpected value $e")
}

/** A field problem as the cases write it: values as text, so 3 and "3" don't differ by type. */
private fun expected(e: JsonElement): Pair<String, Map<String, String>>? = when (e) {
  is JsonNull -> null
  else -> e.jsonObject.let { o ->
    val values = o["values"]?.jsonObject?.mapValues { (_, v) -> v.jsonPrimitive.let { p -> if (p.isString) p.content else (p.doubleOrNull ?: 0.0).let(::jsNumber) } } ?: emptyMap()
    o.getValue("message").jsonPrimitive.content to values
  }
}

private fun jsNumber(n: Double): String = if (n == Math.rint(n)) n.toLong().toString() else n.toString()

class FieldsConformanceTest {
  private val cases: List<JsonObject> =
    Json.parseToJsonElement(File(repoRoot, "conformance/fields/fields.json").readText()).jsonObject.getValue("cases").jsonArray.map { it.jsonObject }

  @Test
  fun `finds the cases`() {
    assertTrue(cases.size >= 40, "field cases not found")
  }

  @TestFactory
  fun cases(): List<DynamicTest> = cases.map { case ->
    DynamicTest.dynamicTest(case.getValue("id").jsonPrimitive.content) {
      val type = ComponentType.fromWireName(case.getValue("component").jsonPrimitive.content) ?: error("unknown component")
      val props = case.getValue("props").jsonObject.mapValues { propValue(it.value) }
      val problem = checkField(type, props, primitive(case.getValue("value")))
      val actual = problem?.let { it.message to it.values }
      assertEquals(expected(case.getValue("expect")), actual, case.getValue("description").jsonPrimitive.content)
    }
  }

  @Test
  fun `the fields a governed button reads, in the order their lines arrived`() {
    val parser = OmniParser(mapOf("support.createTicket" to Tool.acceptsAnything))
    parser.write(
      listOf(
        "root = Card([email, search, note, send])",
        "\$email = \"\"",
        "email = Input(\$email, label=\"Email\", required=true, format=\"email\")",
        "\$q = \"\"",
        "search = Input(\$q, label=\"Search\", required=true)",
        "\$msg = \"\"",
        "note = Input(\$msg, label=\"Message\", required=true, lines=4)",
        "send = Button(\"Send\", action=\"go\")",
        "go = McpMutation(send, tool=\"support.createTicket\", params={subject: \$email, message: \$msg})",
        "",
      ).joinToString("\n"),
    )
    val doc = parser.document
    assertEquals(listOf("email", "note"), fieldsReadBy(doc.mutations.getValue("send"), doc))
  }
}
