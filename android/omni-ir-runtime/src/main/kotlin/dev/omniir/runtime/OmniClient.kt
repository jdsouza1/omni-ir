// Client for an Omni-IR server such as the repo's reference server (server/): `POST /api/generate`
// streams a screen as server-sent events, and `POST /api/mutate` runs a governed action, which the
// server checks again. Port of packages/react/src/client. Uses only the JDK's HTTP classes.
package dev.omniir.runtime

import dev.omniir.core.FORMAT_VERSION
import dev.omniir.core.Primitive
import dev.omniir.core.UpdateResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.job
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.util.UUID

/** How a `generate` call ended. */
public sealed interface GenerateOutcome {
  /**
   * The stream finished. `stopReason` is "end_turn", "max_tokens" or "refusal". `screen`: the server keeps
   * this screen current; pass it to `follow` (SPEC.md [10.36]).
   */
  public data class Done(val stopReason: String, val model: String, val milliseconds: Double, val screen: String? = null) : GenerateOutcome

  /** The server or the connection failed; `retryable` says whether trying again may help. */
  public data class Failed(val code: String, val message: String, val retryable: Boolean) : GenerateOutcome

  /** The caller cancelled. */
  public data object Aborted : GenerateOutcome
}

/** How following a screen ended (SPEC.md [10.37]-[10.39]). */
public sealed interface FollowOutcome {
  /** The server sent `end`: the screen won't change again. */
  public data object Ended : FollowOutcome

  /** The caller cancelled. */
  public data object Aborted : FollowOutcome

  /** The server refused for good: `not_found`, or another error that isn't retryable. */
  public data class Failed(val code: String, val message: String) : FollowOutcome
}

/** The server refused an action, with its message. */
public class MutationRejectedException(message: String) : Exception(message)

public class OmniClient(
  /** The server's origin, such as `https://example.com` or `http://10.0.2.2:8787` (the emulator's host). */
  public val baseUrl: String,
  /** With no bytes for this long, pings included, the stream counts as lost (SPEC.md [10.10]). */
  public val idleTimeoutMillis: Int = 45_000,
  /** The signed-in person's session token, sent as `Authorization: Bearer …` (SPEC.md [10.14]); null when signed out. */
  public val token: () -> String? = { null },
) {
  /**
   * Asks the server for a screen and writes it into `store` as it streams. The store is always ended
   * once the stream has started (done, error, cancelled or dropped), so anything that never arrived
   * becomes a fallback instead of loading forever. Cancel the coroutine to stop.
   */
  public suspend fun generate(prompt: String, store: OmniStore): GenerateOutcome =
    // Ask for this package's format (SPEC.md [10.1]). A server that compares versions exactly (0.6 and 0.7
    // did) refuses a different number; one retry without a version gets the stream, and the parser's
    // marker check decides whether the screen needs a newer app ([10.12], [3.9]).
    request(prompt, store, withVersion = true) ?: request(prompt, store, withVersion = false) ?: GenerateOutcome.Failed(
      "unsupported_version", "The server can't write a stream this app can read.", retryable = false,
    )

  /** One request for a screen. Null means the server refused the requested version, so the caller may retry without it. */
  private suspend fun request(prompt: String, store: OmniStore, withVersion: Boolean): GenerateOutcome? = withContext(Dispatchers.IO) {
    val connection = try {
      open("api/generate" + (if (withVersion) "?version=$FORMAT_VERSION" else ""), Json.obj(mapOf("prompt" to prompt)), accept = "text/event-stream")
    } catch (e: IOException) {
      return@withContext GenerateOutcome.Failed("network_error", "Could not reach the server.", retryable = true)
    }
    val stop = currentCoroutineContext().job.invokeOnCompletion { connection.disconnect() }
    try {
      val status = try { connection.responseCode } catch (e: IOException) {
        return@withContext if (isCancelled()) GenerateOutcome.Aborted else GenerateOutcome.Failed("network_error", "Could not reach the server.", retryable = true)
      }
      // Errors before the stream starts (bad request, rate limit): the store is left untouched.
      if (status !in 200..299) {
        val refused = errorResponse(connection, status)
        return@withContext if (withVersion && refused is GenerateOutcome.Failed && refused.code == "unsupported_version") null else refused
      }

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
  public fun mutationHandler(
    /**
     * Called with the update a successful action's result carries ([10.35]), to apply to the screen the
     * Button was pressed on: usually `{ text, _ -> store.update(text) }`. The pressed Button's id is sent so
     * the server can write the update for it. (First, so a trailing lambda is still `onResult`.)
     */
    onUpdate: ((String, MutationCall) -> Unit)? = null,
    onResult: ((MutationCall, String) -> Unit)? = null,
  ): suspend (MutationCall) -> Unit = { call ->
    // One key per press, kept for the retry, so a server that honours keys never runs it twice.
    val key = UUID.randomUUID().toString()
    val fields = mutableMapOf<String, Any?>("tool" to call.tool, "params" to call.params.mapValues { Json.primitive(it.value) })
    if (onUpdate != null) fields["button"] = call.target
    val request = Json.obj(fields)
    val send = {
      val connection = open("api/mutate", request, headers = mapOf("Idempotency-Key" to key))
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      status to (stream?.use { String(it.readBytes(), Charsets.UTF_8) } ?: "")
    }
    val (status, body) = withContext(Dispatchers.IO) {
      try {
        send()
      } catch (e: IOException) {
        try { send() } catch (again: IOException) { throw MutationRejectedException("Could not reach the server.") }
      }
    }
    val json = Json.parseObject(body)
    if (status !in 200..299) {
      val message = (json?.get("error") as? Map<*, *>)?.get("message") as? String
      throw MutationRejectedException(message ?: "The action failed ($status).")
    }
    onResult?.invoke(call, json?.get("result")?.let(Json::write) ?: "{}")
    (json?.get("update") as? String)?.let { onUpdate?.invoke(it, call) }
  }

  /**
   * Follows a screen the server keeps current ([10.37]-[10.39]): applies each update to `store`, in order,
   * until the server says the screen won't change again or the coroutine is cancelled. A dropped
   * connection is followed again from the last update received, waiting longer each time, up to a minute.
   * `onUpdate` gets each result; a rejected update is a bug in the app's code.
   */
  public suspend fun follow(screen: String, store: OmniStore, retryMillis: Long = 1000, onUpdate: ((UpdateResult, Int) -> Unit)? = null): FollowOutcome {
    var last = 0
    var failures = 0
    while (true) {
      if (isCancelled()) return FollowOutcome.Aborted
      var gotSomething = false
      val ended = withContext(Dispatchers.IO) {
        val path = "api/live?screen=" + URLEncoder.encode(screen, Charsets.UTF_8) + "&after=$last"
        val connection = try { get(path) } catch (e: IOException) { return@withContext null }
        val stop = currentCoroutineContext().job.invokeOnCompletion { connection.disconnect() }
        try {
          val status = try { connection.responseCode } catch (e: IOException) { return@withContext null }
          if (status !in 200..299) {
            val refused = errorResponse(connection, status) as GenerateOutcome.Failed
            return@withContext if (refused.retryable) null else FollowOutcome.Failed(refused.code, refused.message)
          }
          val reader = LiveReader()
          try {
            connection.inputStream.use { input ->
              val buffer = ByteArray(8192)
              while (true) {
                currentCoroutineContext().ensureActive()
                val n = input.read(buffer)
                if (n < 0) break
                for (step in reader.feed(buffer.copyOf(n))) {
                  gotSomething = true
                  when (step) {
                    LiveStep.End -> return@withContext FollowOutcome.Ended
                    is LiveStep.Update -> if (step.seq > last) {
                      last = step.seq // a rejected update still counts as received ([10.38])
                      val result = store.update(step.text)
                      onUpdate?.invoke(result, step.seq)
                    }
                  }
                }
              }
            }
          } catch (e: IOException) {
            // dropped: follow again below
          }
          null
        } finally {
          stop.dispose()
        }
      }
      if (ended != null) return ended
      if (isCancelled()) return FollowOutcome.Aborted
      failures = if (gotSomething) 0 else failures + 1
      delay(minOf(60_000L, retryMillis shl minOf(16, maxOf(0, failures - 1))))
    }
  }

  private fun get(path: String): HttpURLConnection {
    val url = URI(baseUrl.trimEnd('/') + "/" + path).toURL()
    return (url.openConnection() as HttpURLConnection).apply {
      requestMethod = "GET"
      connectTimeout = 15_000
      readTimeout = idleTimeoutMillis
      setRequestProperty("accept", "text/event-stream")
      token()?.let { setRequestProperty("Authorization", "Bearer $it") }
    }
  }

  private fun open(path: String, body: String, accept: String = "application/json", headers: Map<String, String> = emptyMap()): HttpURLConnection {
    val url = URI(baseUrl.trimEnd('/') + "/" + path).toURL()
    return (url.openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      doOutput = true
      connectTimeout = 15_000
      readTimeout = idleTimeoutMillis
      setRequestProperty("content-type", "application/json")
      setRequestProperty("accept", accept)
      token()?.let { setRequestProperty("Authorization", "Bearer $it") }
      for ((name, value) in headers) setRequestProperty(name, value)
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
  /** The id of a screen the server keeps current, from a `live` event ([10.36]). */
  private var screen: String? = null

  fun feed(bytes: ByteArray): List<String> {
    val texts = mutableListOf<String>()
    for (event in decoder.feed(bytes)) {
      if (outcome != null) break
      when (val step = interpret(event)) {
        is StreamStep.Text -> texts += step.text
        is StreamStep.Live -> screen = step.screen
        is StreamStep.Finished -> outcome = (step.outcome as? GenerateOutcome.Done)?.copy(screen = screen) ?: step.outcome
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
  data class Live(val screen: String) : StreamStep
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
    "live" -> (payload["screen"] as? String)?.takeIf { it.isNotEmpty() }?.let { StreamStep.Live(it) } ?: StreamStep.Ignored
    else -> StreamStep.Ignored
  }
}

/** One step of a live feed ([10.37]). */
internal sealed interface LiveStep {
  data class Update(val seq: Int, val text: String) : LiveStep
  data object End : LiveStep
}

/** The events of one `GET /api/live` response, read as [10.6] says; anything else is skipped. */
internal class LiveReader {
  private val decoder = ServerEventDecoder()

  fun feed(bytes: ByteArray): List<LiveStep> = decoder.feed(bytes).mapNotNull { event ->
    val payload = Json.parseObject(event.data) ?: return@mapNotNull null
    when (event.event) {
      "end" -> LiveStep.End
      "update" -> {
        val seq = (payload["seq"] as? Double)?.takeIf { it >= 1 && it == Math.floor(it) && it < Int.MAX_VALUE }?.toInt()
        val text = payload["text"] as? String
        if (seq != null && text != null) LiveStep.Update(seq, text) else null
      }
      else -> null
    }
  }
}

internal fun errorOutcome(payload: Map<*, *>): GenerateOutcome = GenerateOutcome.Failed(
  code = payload["code"] as? String ?: "server_error",
  message = payload["message"] as? String ?: "Something went wrong.",
  retryable = payload["retryable"] as? Boolean ?: false,
)

internal val CONNECTION_LOST = GenerateOutcome.Failed("connection_lost", "The connection closed before the screen finished.", retryable = true)
