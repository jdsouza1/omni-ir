// Runs the transport conformance cases (conformance/transport/*.json, SPEC.md section 10) against the
// client's stream handling, with each case's response split into reads of several sizes.
package dev.omniir.runtime

import java.io.File
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import kotlin.test.assertEquals
import kotlin.test.assertIs

private val repoRoot = File(System.getProperty("omniir.repoRoot") ?: "../..")

class TransportConformanceTest {
  private class Result(val written: String, val ended: Boolean, val outcome: GenerateOutcome)

  private fun run(status: Int, body: ByteArray, size: Int?): Result {
    if (status !in 200..299) return Result("", false, errorResponseOutcome(status, String(body, Charsets.UTF_8)))
    val reader = StreamReader()
    val written = StringBuilder()
    val step = size ?: maxOf(body.size, 1)
    for (at in body.indices step step) reader.feed(body.copyOfRange(at, minOf(at + step, body.size))).forEach { written.append(it) }
    return Result(written.toString(), true, reader.finish())
  }

  @TestFactory
  fun cases(): List<DynamicTest> {
    val dir = File(repoRoot, "conformance/transport")
    val cases = dir.listFiles { f -> f.name.endsWith(".json") }.orEmpty().sortedBy { it.name }.flatMap {
      (Json.parseObject(it.readText())?.get("cases") as? List<*>).orEmpty().filterIsInstance<Map<*, *>>()
    }
    check(cases.size >= 20) { "transport cases not found in $dir" }
    return cases.map { case ->
      DynamicTest.dynamicTest(case["id"] as String) {
        val response = case["response"] as Map<*, *>
        val body = when (val b = response["body"]) {
          is String -> b
          is List<*> -> b.joinToString("") { it as String }
          else -> error("bad body")
        }.toByteArray(Charsets.UTF_8)
        val expect = case["expect"] as Map<*, *>
        val expected = expect["outcome"] as Map<*, *>
        for (size in listOf(null, 1, 5, 13)) {
          val result = run((response["status"] as Double).toInt(), body, size)
          val label = "reads of ${size ?: "all"} bytes"
          assertEquals(expect["written"], result.written, label)
          assertEquals(expect["ended"], result.ended, label)
          when (expected["status"]) {
            "done" -> {
              val done = assertIs<GenerateOutcome.Done>(result.outcome, label)
              expected["stopReason"]?.let { assertEquals(it, done.stopReason, label) }
              expected["model"]?.let { assertEquals(it, done.model, label) }
              expected["ms"]?.let { assertEquals(it, done.milliseconds, label) }
            }
            else -> {
              val failed = assertIs<GenerateOutcome.Failed>(result.outcome, label)
              assertEquals(expected["code"], failed.code, label)
              assertEquals(expected["retryable"], failed.retryable, label)
            }
          }
        }
      }
    }
  }
}
