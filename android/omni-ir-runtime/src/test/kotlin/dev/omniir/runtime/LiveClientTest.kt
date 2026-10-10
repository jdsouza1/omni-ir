// Live screens in the Kotlin client (SPEC.md [10.35]-[10.39]), end to end against a small HTTP server
// in the test speaking the reference server's protocol: the `live` event, following a screen and
// following again after a drop, and an action's result updating the screen its Button was on.
package dev.omniir.runtime

import com.sun.net.httpserver.HttpServer
import dev.omniir.core.Primitive
import dev.omniir.core.PropValue
import dev.omniir.core.Tool
import kotlinx.coroutines.runBlocking
import java.net.InetSocketAddress
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

private const val ORDER = "root = Card([order_status, ret])\norder_status = Badge(\"Shipped\")\n" +
  "ret = Button(\"Request a return\", action=\"go\")\ngo = McpMutation(ret, tool=\"orders.requestReturn\", params={orderId: \"A1\"})\n"

class LiveReaderTest {
  @Test
  fun `reads updates and end, skipping anything malformed`() {
    val reader = LiveReader()
    val steps = reader.feed(
      ("event: update\ndata: {\"seq\":1,\"text\":\"a = Divider()\\n\"}\n\n: ping\n\n" +
        "event: update\ndata: {\"seq\":\"2\",\"text\":\"x\"}\n\nevent: update\ndata: {\"seq\":1.5,\"text\":\"x\"}\n\n" +
        "event: other\ndata: {}\n\nevent: end\ndata: {}\n\n").toByteArray(),
    )
    assertEquals(listOf(LiveStep.Update(1, "a = Divider()\n"), LiveStep.End), steps)
  }

  @Test
  fun `a live event before done gives the outcome its screen (10_36)`() {
    val reader = StreamReader()
    reader.feed("event: chunk\ndata: {\"text\":\"root = Divider()\\n\"}\n\nevent: live\ndata: {\"screen\":\"scr_1\"}\n\nevent: done\ndata: {\"stopReason\":\"end_turn\",\"model\":\"m\",\"ms\":1}\n\n".toByteArray())
    assertEquals(GenerateOutcome.Done("end_turn", "m", 1.0, screen = "scr_1"), reader.outcome)
  }
}

class LiveClientTest {
  private lateinit var server: HttpServer
  private lateinit var client: OmniClient
  private val asked = mutableListOf<String>()
  private val mutateBodies = mutableListOf<String>()

  @BeforeEach
  fun start() {
    server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    server.createContext("/api/generate") { exchange ->
      exchange.requestBody.readBytes()
      exchange.sendResponseHeaders(200, 0)
      exchange.responseBody.use { out ->
        out.write("event: chunk\ndata: ${Json.obj(mapOf("text" to ORDER))}\n\n".toByteArray())
        out.write("event: live\ndata: {\"screen\":\"scr_1\"}\n\nevent: done\ndata: {\"stopReason\":\"end_turn\",\"model\":\"mock\",\"ms\":5}\n\n".toByteArray())
      }
    }
    server.createContext("/api/live") { exchange ->
      val query = exchange.requestURI.query ?: ""
      asked += query
      if (!query.startsWith("screen=scr_1&")) {
        val body = """{"error":{"code":"not_found","message":"That screen isn't followed here.","retryable":false}}""".toByteArray()
        exchange.sendResponseHeaders(404, body.size.toLong())
        exchange.responseBody.use { it.write(body) }
        return@createContext
      }
      exchange.sendResponseHeaders(200, 0)
      exchange.responseBody.use { out ->
        if (query.endsWith("after=0")) {
          // The first update, then the connection drops without `end`.
          out.write("event: update\ndata: ${Json.obj(mapOf("seq" to 1.0, "text" to "order_status = Badge(\"Out for delivery\")\n"))}\n\n".toByteArray())
        } else {
          out.write("event: update\ndata: ${Json.obj(mapOf("seq" to 1.0, "text" to "order_status = Badge(\"Again\")\n"))}\n\n".toByteArray())
          out.write("event: update\ndata: ${Json.obj(mapOf("seq" to 2.0, "text" to "order_status = Badge(\"Delivered\", tone=\"success\")\n"))}\n\n".toByteArray())
          out.write("event: end\ndata: {}\n\n".toByteArray())
        }
      }
    }
    server.createContext("/api/mutate") { exchange ->
      val body = String(exchange.requestBody.readBytes())
      mutateBodies += body
      val update = if (body.contains("\"button\":\"ret\"")) ""","update":"ret = Notice(\"Return requested\", tone=\"success\")\n"""" else ""
      val reply = """{"ok":true,"tool":"orders.requestReturn","result":{"returnId":"ret_1"}$update}""".toByteArray()
      exchange.sendResponseHeaders(200, reply.size.toLong())
      exchange.responseBody.use { it.write(reply) }
    }
    server.start()
    client = OmniClient("http://127.0.0.1:${server.address.port}")
  }

  @AfterEach
  fun stop() = server.stop(0)

  private fun store() = OmniStore(mapOf("orders.requestReturn" to Tool.acceptsAnything))

  private fun status(store: OmniStore) = (store.document.value.nodes["order_status"]?.props?.get("text") as? PropValue.Text)?.value

  @Test
  fun `follows a screen, again after a drop from the last update, until end (10_37 10_38 10_39)`() = runBlocking {
    val store = store()
    val outcome = client.generate("where is my order?", store)
    assertIs<GenerateOutcome.Done>(outcome)
    assertEquals("scr_1", outcome.screen)
    val seen = mutableListOf<Int>()
    assertEquals(FollowOutcome.Ended, client.follow("scr_1", store, retryMillis = 10) { result, seq -> if (result.applied) seen += seq })
    assertEquals("Delivered", status(store))
    // seq 1 came twice: applied once, in order.
    assertEquals(listOf(1, 2), seen)
    assertEquals(listOf("screen=scr_1&after=0", "screen=scr_1&after=1"), asked)
  }

  @Test
  fun `stops on a screen the server doesn't know`() = runBlocking {
    val outcome = client.follow("scr_other", store())
    assertIs<FollowOutcome.Failed>(outcome)
    assertEquals("not_found", outcome.code)
  }

  @Test
  fun `an action's result updates where its Button was, naming the Button only when asked (10_35)`() = runBlocking {
    val store = store()
    client.generate("where is my order?", store)
    val call = MutationCall("go", "ret", "orders.requestReturn", mapOf("orderId" to Primitive.Text("A1")))
    client.mutationHandler()(call)
    assertTrue("\"button\"" !in mutateBodies.last())
    client.mutationHandler(onUpdate = { text, _ -> store.update(text) })(call)
    assertTrue("\"button\":\"ret\"" in mutateBodies.last())
    assertEquals("Notice", store.document.value.nodes["ret"]?.type?.wireName)
    assertTrue("ret" !in store.document.value.mutations)
    // [8.8]: only the Notices an update adds or changes are read out.
    assertEquals("Return requested", store.updateAnnouncement())
    store.update("order_status = Badge(\"Out again\")\n")
    assertEquals("", store.updateAnnouncement())
  }
}
