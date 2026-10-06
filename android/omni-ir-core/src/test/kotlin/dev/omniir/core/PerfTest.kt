// Performance budget (PLAN-HARDENING.md C.3): a 20,000-component stream, fed line by line, must parse
// in under 5 seconds. Generous so CI never flakes; it fails only if parsing goes back to quadratic.
package dev.omniir.core

import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.junit.jupiter.api.Test

/** A valid screen of about `n` components (as scripts/perf.ts makes them). */
internal fun perfScreen(n: Int): List<String> {
  val lines = mutableListOf<String>()
  val leaves = maxOf(1, n - 3)
  val groups = (leaves + 199) / 200
  lines += "root = Stack([${(0 until groups).joinToString(", ") { "g$it" }}, pay])"
  var made = 0
  for (g in 0 until groups) {
    val count = minOf(200, leaves - made)
    lines += "g$g = Stack([${(0 until count).joinToString(", ") { "t${made + it}" }}])"
    for (k in 0 until count) lines += "t${made + k} = Text(\"Row ${made + k}\", tone=\"muted\")"
    made += count
  }
  lines += "\$amount = 42.5"
  lines += "pay = Button(\"Pay\", action=\"pay\")"
  lines += "payM = McpMutation(pay, tool=\"payments.confirm\", params={amount: \$amount, note: \"\"})"
  return lines
}

class PerfTest {
  private fun parse(n: Int): Pair<Long, OmniParser> {
    val parser = OmniParser(mapOf("payments.confirm" to Tool.acceptsAnything))
    val start = System.nanoTime()
    for (line in perfScreen(n)) parser.write("$line\n")
    parser.end()
    return (System.nanoTime() - start) / 1_000_000 to parser
  }

  @Test
  fun `parses a 20,000-component stream line by line in under 5 seconds`() {
    parse(1000) // warm up
    for (n in listOf(1000, 5000)) println("perf: $n components in ${parse(n).first} ms")
    val (ms, parser) = parse(20_000)
    println("perf: 20000 components in $ms ms")
    assertEquals(emptyList(), parser.issues)
    assertTrue(parser.document.nodes.size >= 20_000)
    assertTrue(ms < 5_000, "took $ms ms")
  }
}
