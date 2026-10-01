// The server client: event framing on its own, then end to end against a small HTTP server running
// in the test (the JDK's built-in one), speaking the same protocol as the repo's Express server.
package dev.omniir.runtime

import com.sun.net.httpserver.HttpServer
import dev.omniir.core.Primitive
import dev.omniir.core.Tool
import kotlinx.coroutines.runBlocking
import java.net.InetSocketAddress
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertTrue

class ServerEventTest {
  @Test
  fun `blocks end with a blank line, however the bytes are split, with CRLF framing too`() {
    val stream = "event: chunk\r\ndata: {\"text\":\"root = \"}\r\n\r\n: heartbeat\n\nevent: chunk\ndata: {\"text\":\"Divider()\\n\"}\n\nevent: done\ndata: {\"stopReason\":\"end_turn\",\"model\":\"mock\",\"ms\":12}\n\n"
    for (size in listOf(1, 3, 7, 1000)) {
      val decoder = ServerEventDecoder()
      val bytes = stream.toByteArray()
      val events = (bytes.indices step size).flatMap { decoder.feed(bytes.copyOfRange(it, minOf(it + size, bytes.size))) }
      assertEquals(listOf("chunk", "chunk", "done"), events.map { it.event }, "chunks of $size")
      assertEquals(
        listOf(StreamStep.Text("root = "), StreamStep.Text("Divider()\n"), StreamStep.Finished(GenerateOutcome.Done("end_turn", "mock", 12.0))),
        events.map(::interpret),
      )
    }
  }

  @Test
  fun `an error event becomes an error outcome, and unknown or malformed events are ignored`() {
    assertEquals(
      StreamStep.Finished(GenerateOutcome.Failed("model_error", "The model failed.", true)),
      interpret(ServerEvent("error", """{"code":"model_error","message":"The model failed.","retryable":true}""")),
    )
    assertEquals(StreamStep.Ignored, interpret(ServerEvent("chunk", "not json")))
    assertEquals(StreamStep.Ignored, interpret(ServerEvent("ping", "{}")))
  }

  @Test
  fun `data lines are joined, and an unfinished block at the end is dropped`() {
    assertEquals(listOf(ServerEvent("message", "a\nb")), ServerEventDecoder().feed("data: a\ndata: b\n\ndata: unfinished\n".toByteArray()))
  }

  @Test
  fun `json round trip`() {
    val text = Json.obj(mapOf("tool" to "payments.confirm", "params" to mapOf("amount" to 42.5, "n" to 3.0, "note" to "a \"quote\"\n", "gift" to false, "ref" to null)))
    assertEquals("""{"tool":"payments.confirm","params":{"amount":42.5,"n":3,"note":"a \"quote\"\n","gift":false,"ref":null}}""", text)
    assertEquals(mapOf("tool" to "payments.confirm", "params" to mapOf("amount" to 42.5, "n" to 3.0, "note" to "a \"quote\"\n", "gift" to false, "ref" to null)), Json.parseObject(text))
  }
}

class ClientTest {
  private lateinit var server: HttpServer
  private val mutateBodies = mutableListOf<String>()
  private lateinit var client: OmniClient

  @BeforeEach
  fun start() {
    server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    server.createContext("/api/generate") { exchange ->
      val prompt = String(exchange.requestBody.readBytes())
      exchange.responseHeaders.add("content-type", "text/event-stream")
      if (prompt.contains("rate limit")) {
        val body = """{"error":{"code":"rate_limited","message":"Too many requests.","retryable":true}}""".toByteArray()
        exchange.sendResponseHeaders(429, body.size.toLong())
        exchange.responseBody.use { it.write(body) }
        return@createContext
      }
      exchange.sendResponseHeaders(200, 0)
      exchange.responseBody.use { out ->
        val lines = listOf("root = Card([title, pay])\n", "title = Heading(\"Confirm payment\")\n", "pay = Button(\"Pay\", action=\"pay\")\n", "payM = McpMutation(pay, tool=\"payments.confirm\", params={amount: 42.5})\n")
        for (line in lines) {
          out.write("event: chunk\ndata: ${Json.obj(mapOf("text" to line))}\n\n".toByteArray())
          out.flush()
        }
        if (!prompt.contains("cut off")) out.write("event: done\ndata: {\"stopReason\":\"end_turn\",\"model\":\"mock\",\"ms\":5}\n\n".toByteArray())
      }
    }
    server.createContext("/api/mutate") { exchange ->
      val body = String(exchange.requestBody.readBytes())
      mutateBodies += body
      val (status, reply) = if (body.contains("\"amount\":42.5")) 200 to """{"ok":true,"result":{"receiptId":"rcpt_1"}}"""
      else 422 to """{"error":{"code":"invalid_params","message":"amount: too small"}}"""
      val bytes = reply.toByteArray()
      exchange.sendResponseHeaders(status, bytes.size.toLong())
      exchange.responseBody.use { it.write(bytes) }
    }
    server.start()
    client = OmniClient("http://127.0.0.1:${server.address.port}")
  }

  @AfterEach
  fun stop() = server.stop(0)

  private fun store() = OmniStore(mapOf("payments.confirm" to Tool.acceptsAnything))

  @Test
  fun `streams a screen into the store and ends it`() = runBlocking {
    val store = store()
    val outcome = client.generate("a payment", store)
    assertEquals(GenerateOutcome.Done("end_turn", "mock", 5.0), outcome)
    assertTrue(store.document.value.complete)
    assertEquals(setOf("root", "title", "pay"), store.document.value.nodes.keys)
    assertTrue(store.issues.value.isEmpty())
  }

  @Test
  fun `a stream that stops without done is a lost connection, and the store is still ended`() = runBlocking {
    val store = store()
    assertEquals(CONNECTION_LOST, client.generate("cut off", store))
    assertTrue(store.document.value.complete)
  }

  @Test
  fun `an error before the stream starts is reported and leaves the store untouched`() = runBlocking {
    val store = store()
    assertEquals(GenerateOutcome.Failed("rate_limited", "Too many requests.", true), client.generate("rate limit", store))
    assertTrue(store.document.value.nodes.isEmpty() && !store.document.value.complete)
  }

  @Test
  fun `governed actions are posted, and a refusal throws with the server's message`() = runBlocking {
    var result = ""
    val handler = client.mutationHandler { _, json -> result = json }
    handler(MutationCall("payM", "pay", "payments.confirm", mapOf("amount" to Primitive.Number(42.5))))
    assertEquals("""{"receiptId":"rcpt_1"}""", result)
    assertEquals("""{"tool":"payments.confirm","params":{"amount":42.5}}""", mutateBodies.single())
    val refused = assertFailsWith<MutationRejectedException> {
      handler(MutationCall("payM", "pay", "payments.confirm", mapOf("amount" to Primitive.Number(0.0))))
    }
    assertEquals("amount: too small", refused.message)
  }

  @Test
  fun `an unreachable server is a network error`() = runBlocking {
    server.stop(0)
    val outcome = client.generate("anything", store())
    assertIs<GenerateOutcome.Failed>(outcome)
    assertEquals("network_error", outcome.code)
  }
}
