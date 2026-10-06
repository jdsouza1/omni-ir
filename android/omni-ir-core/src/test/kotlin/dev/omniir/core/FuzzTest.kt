// Seeded no-crash fuzzing of the Kotlin parser (PLAN-HARDENING.md, B.3). A crash in the parser would
// take down a Compose app, so whatever arrives (random bytes, invalid UTF-8, token soup, edited
// fixtures, extreme nesting) it must never throw, every issue must be well-formed, and how the bytes
// are split must never change the result. The differential corpus (ConformanceTest) checks that the
// results agree with the other parsers; this checks harsher input than the corpus holds.
package dev.omniir.core

import java.io.File
import kotlin.random.Random
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.jupiter.api.Test

private val repoRoot = File(System.getProperty("omniir.repoRoot") ?: "..")
private val runs = System.getenv("FUZZ_RUNS")?.toIntOrNull() ?: 1000
private val seed = System.getenv("FUZZ_SEED")?.toLongOrNull() ?: 20261005L

private val TOOLS: ToolRegistry = listOf(
  "payments.confirm", "auth.sendMagicLink", "profile.update", "orders.requestReturn",
  "support.createTicket", "bookings.reserve", "assistant.ask", "settings.update",
).associateWith { Tool.acceptsAnything }
private val ASSETS = setOf("cabin-pines", "shirt", "tote")

private val TOKENS = listOf(
  "root", "a", "b", "pay", "\$a", "\$__proto__", "__proto__", " = ", "=", "Card", "Text", "Button", "List", "ListItem",
  "Table", "TableRow", "Tabs", "Tab", "BarChart", "Series", "PieChart", "Slice", "McpMutation", "Image", "Input",
  "(", ")", "[", "]", "{", "}", ",", ":", "\"", "\\", "\\\"", "\\n", "\\u0041", "42", "-0", "1e999", "-1e-400", ".5",
  "true", "false", "null", "# ", "tool=", "\"payments.confirm\"", "params=", "action=", "label=", "alt=", "+",
  " ", "\t", "\n", "\r\n", "\r", "é", "😀", "\u0000", "​", "﻿", "а",
)

private fun fixtures(): List<String> =
  File(repoRoot, "fixtures").walkTopDown().filter { it.isFile && it.name.endsWith(".omni") }.sortedBy { it.path }.map { it.readText() }.toList()

private fun tokenSoup(r: Random): String = buildString { repeat(r.nextInt(1, 120)) { append(TOKENS[r.nextInt(TOKENS.size)]) } }

private fun randomBytes(r: Random): ByteArray = r.nextBytes(r.nextInt(0, 2000))

private fun edited(r: Random, fixtures: List<String>): String {
  var t = fixtures[r.nextInt(fixtures.size)]
  repeat(r.nextInt(1, 6)) {
    val at = if (t.isEmpty()) 0 else r.nextInt(t.length + 1)
    t = when (r.nextInt(4)) {
      0 -> t.substring(0, at) + t.substring(minOf(t.length, at + r.nextInt(20)))
      1 -> t.substring(0, at) + TOKENS[r.nextInt(TOKENS.size)] + t.substring(at)
      2 -> t.substring(0, at)
      else -> t.substring(0, at) + tokenSoup(r) + t.substring(at)
    }
  }
  return t
}

/** Lines at the edges: deep nesting, the length limit, many parts. */
private fun extreme(r: Random): String = when (r.nextInt(6)) {
  0 -> "root = Card(" + "[".repeat(r.nextInt(1, 9000)) + "]".repeat(r.nextInt(0, 9000)) + ")\n"
  1 -> "\$a = " + "{x: ".repeat(r.nextInt(1, 4000)) + "1" + "}".repeat(r.nextInt(0, 4000)) + "\n"
  2 -> "root = Text(\"" + "x".repeat(Limits.LINE_LENGTH - 15 + r.nextInt(30)) + "\")\n"
  3 -> "root = Stack([" + (1..r.nextInt(1, 2000)).joinToString(", ") { "c$it" } + "])\n" +
    (1..r.nextInt(1, 300)).joinToString("") { "c$it = Text(\"$it\")\n" }
  4 -> "(".repeat(r.nextInt(1, 9000)) + "\n"
  else -> (1..r.nextInt(1, 3000)).joinToString("") { "\$s$it = $it\n" } + "root = Divider()\n"
}

private data class Result(val issues: Set<Pair<Int?, String>>, val nodes: Set<String>, val state: Map<String, Primitive>, val missing: Set<String>)

private fun parse(chunks: List<Any>): Result {
  val parser = OmniParser(TOOLS, ASSETS)
  for (chunk in chunks) if (chunk is String) parser.write(chunk) else parser.write(chunk as ByteArray)
  parser.end()
  val doc = parser.document
  return Result(parser.issues.map { it.line to it.code.wireName }.toSet(), doc.nodes.keys.toSet(), doc.state, doc.missing.toSet())
}

private fun split(bytes: ByteArray, r: Random): List<ByteArray> {
  if (bytes.isEmpty()) return listOf(bytes)
  val cuts = List(r.nextInt(0, 12)) { r.nextInt(bytes.size) }.distinct().sorted()
  var from = 0
  return cuts.map { at -> bytes.copyOfRange(from, at).also { from = at } } + listOf(bytes.copyOfRange(from, bytes.size))
}

/** Parse whole and split; never throw, issues well-formed, both results equal. */
private fun check(label: String, input: ByteArray, r: Random) {
  val whole = try { parse(listOf(input)) } catch (e: Throwable) { throw AssertionError("$label: threw ${e::class.simpleName}: ${e.message}", e) }
  val lines = String(input, Charsets.UTF_8).split("\r\n", "\r", "\n").size + 1
  for ((line, code) in whole.issues) {
    assertTrue(IssueCode.entries.any { it.wireName == code }, "$label: unknown code $code")
    if (line != null) assertTrue(line in 1..lines, "$label: line $line of $lines")
  }
  val pieces = split(input, r)
  val parts = try { parse(pieces) } catch (e: Throwable) { throw AssertionError("$label: threw when split: ${e::class.simpleName}: ${e.message}", e) }
  assertEquals(whole, parts, "$label: splitting at ${pieces.map { it.size }} changed the result")
}

class FuzzTest {
  @Test
  fun `random bytes, including invalid UTF-8`() {
    val r = Random(seed)
    repeat(runs) { check("bytes #$it (seed $seed)", randomBytes(r), r) }
  }

  @Test
  fun `token soup`() {
    val r = Random(seed + 1)
    repeat(runs) { check("soup #$it (seed $seed)", tokenSoup(r).toByteArray(), r) }
  }

  @Test
  fun `edited fixtures`() {
    val r = Random(seed + 2)
    val all = fixtures()
    assertTrue(all.size >= 10, "found ${all.size} fixtures")
    repeat(runs) { check("edited #$it (seed $seed)", edited(r, all).toByteArray(), r) }
  }

  @Test
  fun `extreme lines - deep nesting, the length limit, many parts`() {
    val r = Random(seed + 3)
    repeat(maxOf(50, runs / 10)) { check("extreme #$it (seed $seed)", extreme(r).toByteArray(), r) }
  }
}
