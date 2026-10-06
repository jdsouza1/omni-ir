// Client for an Omni-IR server such as the repo's reference server (server/): `POST /api/generate`
// streams a screen as server-sent events, and `POST /api/mutate` runs a governed action, which the
// server checks again. Port of packages/react/src/client. Uses only the JDK's HTTP classes.
package dev.omniir.runtime

import dev.omniir.core.OMNI_IR_VERSION
import dev.omniir.core.Primitive
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.job
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI

/** How a `generate` call ended. */
public sealed interface GenerateOutcome {
  /** The stream finished. `stopReason` is "end_turn", "max_tokens" or "refusal". */
  public data class Done(val stopReason: String, val model: String, val milliseconds: Double) : GenerateOutcome

  /** The server or the connection failed; `retryable` says whether trying again may help. */
  public data class Failed(val code: String, val message: String, val retryable: Boolean) : GenerateOutcome

  /** The caller cancelled. */
  public data object Aborted : GenerateOutcome
}

/** The server refused an action, with its message. */
public class MutationRejectedException(message: String) : Exception(message)

public class OmniClient(
  /** The server's origin, such as `https://example.com` or `http://10.0.2.2:8787` (the emulator's host). */
  public val baseUrl: String,
  /** With no bytes for this long, pings included, the stream counts as lost (SPEC.md [10.10]). */
  public val idleTimeoutMillis: Int = 45_000,
) {
  /**
   * Asks the server for a screen and writes it into `store` as it streams. The store is always ended
   * once the stream has started (done, error, cancelled or dropped), so anything that never arrived
   * becomes a fallback instead of loading forever. Cancel the coroutine to stop.
   */
  public suspend fun generate(prompt: String, store: OmniStore): GenerateOutcome = withContext(Dispatchers.IO) {
    val connection = try {
      open("api/generate?version=" + OMNI_IR_VERSION.split(".").take(2).joinToString("."), Json.obj(mapOf("prompt" to prompt)), accept = "text/event-stream")
    } catch (e: IOException) {
      return@withContext GenerateOutcome.Failed("network_error", "Could not reach the server.", retryable = true)
    }
    val stop = currentCoroutineContext().job.invokeOnCompletion { connection.disconnect() }
    try {
      val status = try { connection.responseCode } catch (e: IOException) {
        return@withContext if (isCancelled()) GenerateOutcome.Aborted else GenerateOutcome.Failed("network_error", "Could not reach the server.", retryable = true)
      }
      // Errors before the stream starts (bad request, rate limit): the store is left untouched.
      if (status !in 200..299) return@withContext errorResponse(connection, status)

      val reader = StreamReader()
      try {
        connection.inputStream.use { input ->
          val buffer = ByteArray(8192)
          while (true) {
            currentCoroutineContext().ensureActive()
            val n = input.read(buffer)
            if (n < 0) break
            for (text in reader.feed(buffer.copyOf(n))) store.write(text)
          }
        }
      } catch (e: IOException) {
        store.end()
        return@withContext if (isCancelled()) GenerateOutcome.Aborted else CONNECTION_LOST
      } catch (e: CancellationException) {
        store.end()
        return@withContext GenerateOutcome.Aborted
      }
      store.end()
      reader.outcome ?: if (isCancelled()) GenerateOutcome.Aborted else CONNECTION_LOST
    } finally {
      stop.dispose()
    }
  }

  /**
   * An `onMutation` handler for OmniView that posts governed actions to `/api/mutate`. The server checks
   * the tool and params again. A refusal throws `MutationRejectedException`, which the renderer reports
   * as `handler_failed`. `onResult` gets the server's result as JSON text.
   */
  public fun mutationHandler(onResult: ((MutationCall, String) -> Unit)? = null): suspend (MutationCall) -> Unit = { call ->
    val (status, body) = withContext(Dispatchers.IO) {
      try {
        val connection = open("api/mutate", Json.obj(mapOf("tool" to call.tool, "params" to call.params.mapValues { Json.primitive(it.value) })))
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        status to (stream?.use { String(it.readBytes(), Charsets.UTF_8) } ?: "")
      } catch (e: IOException) {
        throw MutationRejectedException("Could not reach the server.")
      }
    }
    val json = Json.parseObject(body)
    if (status !in 200..299) {
      val message = (json?.get("error") as? Map<*, *>)?.get("message") as? String
      throw MutationRejectedException(message ?: "The action failed ($status).")
    }
    onResult?.invoke(call, json?.get("result")?.let(Json::write) ?: "{}")
  }

  private fun open(path: String, body: String, accept: String = "application/json"): HttpURLConnection {
    val url = URI(baseUrl.trimEnd('/') + "/" + path).toURL()
    return (url.openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      doOutput = true
      connectTimeout = 15_000
      readTimeout = idleTimeoutMillis
      setRequestProperty("content-type", "application/json")
      setRequestProperty("accept", accept)
      outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
    }
  }

  private fun errorResponse(connection: HttpURLConnection, status: Int): GenerateOutcome {
    val body = try { connection.errorStream?.use { String(it.readBytes(), Charsets.UTF_8) } } catch (e: IOException) { null }
    return errorResponseOutcome(status, body)
  }

  private suspend fun isCancelled() = !currentCoroutineContext().job.isActive
}

// MARK: - Server-sent events (no network; tested everywhere)

/** One server-sent event: its name and its (joined) data lines. */
internal data class ServerEvent(val event: String, val data: String)

/**
 * Splits a byte stream into server-sent events. Blocks end with a blank line; `\r\n` counts as `\n`;
 * comment lines (`:`) are skipped. An unfinished block at the end of the stream is dropped.
 */
internal class ServerEventDecoder {
  private var pending = ByteArray(0)

  fun feed(bytes: ByteArray): List<ServerEvent> {
    val merged = ArrayList<Byte>(pending.size + bytes.size)
    for (b in pending) merged += b
    for (b in bytes) {
      if (b == '\n'.code.toByte() && merged.lastOrNull() == '\r'.code.toByte()) merged[merged.size - 1] = b else merged += b
    }
    val events = mutableListOf<ServerEvent>()
    var start = 0
    var i = 0
    while (i < merged.size - 1) {
      if (merged[i] == '\n'.code.toByte() && merged[i + 1] == '\n'.code.toByte()) {
        val block = String(merged.subList(start, i).toByteArray(), Charsets.UTF_8)
        parse(block)?.let(events::add)
        start = i + 2
        i = start
      } else {
        i++
      }
    }
    pending = merged.subList(start, merged.size).toByteArray()
    return events
  }

  private fun parse(block: String): ServerEvent? {
    var event = "message"
    val data = mutableListOf<String>()
    for (line in block.split("\n")) {
      when {
        line.startsWith(":") -> continue // comment, e.g. a heartbeat
        line.startsWith("event:") -> event = line.substring(6).trim()
        line.startsWith("data:") -> data += line.substring(5).removePrefix(" ")
      }
    }
    return if (data.isEmpty()) null else ServerEvent(event, data.joinToString("\n"))
  }
}

/**
 * The events of one `generate` response (SPEC.md [10.6]-[10.9]): `feed` returns the text to write to
 * the parser, and `outcome` is set by the first terminal event, after which everything is ignored.
 */
internal class StreamReader {
  private val decoder = ServerEventDecoder()
  var outcome: GenerateOutcome? = null
    private set

  fun feed(bytes: ByteArray): List<String> {
    val texts = mutableListOf<String>()
    for (event in decoder.feed(bytes)) {
      if (outcome != null) break
      when (val step = interpret(event)) {
        is StreamStep.Text -> texts += step.text
        is StreamStep.Finished -> outcome = step.outcome
        StreamStep.Ignored -> {}
      }
    }
    return texts
  }

  /** How the call ended once the response is over: without a terminal event, the connection was lost. */
  fun finish(): GenerateOutcome = outcome ?: CONNECTION_LOST
}

/** An error status before the stream started ([10.3]): the body's error, or `server_error`. */
internal fun errorResponseOutcome(status: Int, body: String?): GenerateOutcome {
  val error = Json.parseObject(body ?: "")?.get("error") as? Map<*, *>
  return if (error != null) errorOutcome(error) else GenerateOutcome.Failed("server_error", "Request failed ($status).", retryable = status >= 500)
}

/** What one event means for a `generate` call: text for the parser, or how the call ended. */
internal sealed interface StreamStep {
  data class Text(val text: String) : StreamStep
  data class Finished(val outcome: GenerateOutcome) : StreamStep
  data object Ignored : StreamStep
}

internal fun interpret(event: ServerEvent): StreamStep {
  val payload = Json.parseObject(event.data) ?: return StreamStep.Ignored // not ours to interpret
  return when (event.event) {
    "chunk" -> (payload["text"] as? String)?.let { StreamStep.Text(it) } ?: StreamStep.Ignored
    "done" -> StreamStep.Finished(
      GenerateOutcome.Done(
        stopReason = payload["stopReason"] as? String ?: "end_turn",
        model = payload["model"]?.toString() ?: "",
        milliseconds = (payload["ms"] as? Double) ?: 0.0,
      ),
    )
    "error" -> StreamStep.Finished(errorOutcome(payload))
    else -> StreamStep.Ignored
  }
}

internal fun errorOutcome(payload: Map<*, *>): GenerateOutcome = GenerateOutcome.Failed(
  code = payload["code"] as? String ?: "server_error",
  message = payload["message"] as? String ?: "Something went wrong.",
  retryable = payload["retryable"] as? Boolean ?: false,
)

internal val CONNECTION_LOST = GenerateOutcome.Failed("connection_lost", "The connection closed before the screen finished.", retryable = true)
