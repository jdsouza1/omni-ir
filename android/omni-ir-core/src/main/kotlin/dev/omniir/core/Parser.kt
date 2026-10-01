// Streaming parser: chunks → lines (R2) → statements (R4) → validation → document.
// A bad line is reported and skipped; it never stops the stream. Port of packages/core/src/parser.ts.
package dev.omniir.core

/** What happened as the stream was read, in order. */
public sealed interface ParserEvent {
  /** A line defined this component, McpMutation or `$key`. */
  public data class Node(val id: String, val line: Int) : ParserEvent

  /** A reference that hasn't arrived yet; a placeholder shows until it does. */
  public data class Pending(val id: String, val line: Int) : ParserEvent

  /** A pending reference arrived. */
  public data class Resolved(val id: String, val line: Int) : ParserEvent

  public data class Warning(val issue: Issue) : ParserEvent

  public data class Error(val issue: Issue) : ParserEvent

  /** End of stream, with the end-of-stream issues. */
  public data class End(val issues: List<Issue>) : ParserEvent
}

public class OmniParser(
  public val tools: ToolRegistry,
  /** Names of the pictures in the app's asset registry. Without them, no Image is accepted. */
  public val assets: Set<String> = emptySet(),
  maxLineLength: Int = Limits.LINE_LENGTH,
) {
  /** Everything accepted so far. A new object after every change. */
  public var document: OmniDocument = OmniDocument()
    private set

  /** Every error and warning reported so far, in order (end-of-stream issues included after `end()`). */
  public val issues: List<Issue> get() = reported.toList()

  /** Called for every event, in order. */
  public var onEvent: ((ParserEvent) -> Unit)? = null

  /** Called whenever `document` changes. */
  public var onChange: ((OmniDocument) -> Unit)? = null

  private val reported = mutableListOf<Issue>()
  private val buffer = LineBuffer(maxLineLength)
  private val accepted = mutableListOf<Statement>()
  private val lineOf = mutableMapOf<String, Int>()
  private var endIssues: List<Issue>? = null

  /** Write text as it arrives; it may end anywhere, even in the middle of a line. Ignored after `end()`. */
  public fun write(text: String) {
    if (endIssues != null) return
    buffer.push(text).forEach(::handle)
  }

  /** Write UTF-8 bytes as they arrive; a chunk may end in the middle of a character. Ignored after `end()`. */
  public fun write(bytes: ByteArray) {
    if (endIssues != null) return
    buffer.push(bytes).forEach(::handle)
  }

  /**
   * End of stream: flush the last line, run the whole-document checks and mark missing references.
   * Returns the end-of-stream issues. Calling it again returns the same issues.
   */
  public fun end(): List<Issue> {
    endIssues?.let { return it }
    buffer.end().forEach(::handle)
    val found = validateDocument(accepted, complete = true).map { issue ->
      val line = issue.id?.let { lineOf[it] }
      if (line != null) issue.copy(line = line) else issue
    }
    endIssues = found
    document = document.finished()
    onChange?.invoke(document)
    for (issue in found) {
      reported += issue
      onEvent?.invoke(ParserEvent.Error(issue))
    }
    onEvent?.invoke(ParserEvent.End(found))
    return found
  }

  /** A local state edit from an Input or DateInput (R1). The key must already be declared by the stream. */
  public fun setState(key: String, value: Primitive) {
    val current = document.state[key] ?: return
    if (current == value) return
    document = document.copy(state = document.state + (key to value))
    onChange?.invoke(document)
  }

  private fun reject(found: List<Issue>, line: Int) {
    for (issue in found) {
      val placed = issue.copy(line = line)
      reported += placed
      onEvent?.invoke(ParserEvent.Error(placed))
    }
  }

  private fun handle(event: LineEvent) {
    when (event) {
      is LineEvent.Overflow -> reject(listOf(Issue(IssueCode.LINE_TOO_LONG, "line is longer than the limit (${event.length} characters seen)")), event.number)
      is LineEvent.Line -> {
        val line = event.number
        when (val parsed = parseLine(event.text)) {
          LineResult.Empty -> return
          is LineResult.Error -> reject(listOf(parsed.issue), line)
          is LineResult.Statement -> {
            for (warning in parsed.warnings) {
              val placed = warning.copy(line = line)
              reported += placed
              onEvent?.invoke(ParserEvent.Warning(placed))
            }
            when (val result = validateStatement(parsed.statement, tools, assets)) {
              is StatementResult.Failed -> reject(listOf(result.issue), line)
              is StatementResult.Ok -> {
                // The accepted statements are always consistent, so any new issue is caused by this line.
                val conflicts = validateDocument(accepted + result.statement, complete = false)
                if (conflicts.isNotEmpty()) return reject(conflicts, line)
                accepted += result.statement
                val id = result.statement.definedId
                lineOf[id] = line
                val (next, pending, resolved) = document.applied(result.statement)
                document = next
                onChange?.invoke(document)
                onEvent?.invoke(ParserEvent.Node(id, line))
                resolved.forEach { onEvent?.invoke(ParserEvent.Resolved(it, line)) }
                pending.forEach { onEvent?.invoke(ParserEvent.Pending(it, line)) }
              }
            }
          }
        }
      }
    }
  }
}

/** The document with an accepted statement added, plus the references it left pending and the ones it resolved. */
internal fun OmniDocument.applied(statement: Statement): Triple<OmniDocument, List<String>, List<String>> {
  val pending = pending.toMutableSet()
  val newlyPending = mutableListOf<String>()
  val resolved = mutableListOf<String>()
  fun define(id: String) {
    if (pending.remove(id)) resolved += id
  }

  var nodes = nodes
  var mutations = mutations
  var state = state
  val refs: List<String> = when (statement) {
    is Statement.State -> {
      state = state + (statement.key to statement.value)
      define(statement.key)
      emptyList()
    }
    is Statement.Node -> {
      nodes = nodes + (statement.node.id to statement.node)
      define(statement.node.id)
      statement.node.children + stateKeys(statement.node.props)
    }
    is Statement.MutationStatement -> {
      mutations = mutations + (statement.mutation.target to statement.mutation)
      stateKeys(statement.mutation.params)
    }
  }
  for (ref in refs) {
    val known = if (ref.startsWith("$")) ref in state else ref in nodes
    if (!known && pending.add(ref)) newlyPending += ref
  }
  return Triple(copy(nodes = nodes, mutations = mutations, state = state, pending = pending), newlyPending, resolved)
}

/** End of stream: every still-pending reference becomes missing. */
internal fun OmniDocument.finished(): OmniDocument = if (complete) this else copy(missing = pending, pending = emptySet(), complete = true)
