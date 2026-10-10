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

  /** An update after the stream ended ([10.29]), applied whole or not at all; its issues count lines from 1 in the update. */
  public data class Update(val result: UpdateResult) : ParserEvent
}

public class OmniParser(
  public val tools: ToolRegistry,
  /** Names of the pictures in the app's asset registry. Without them, no Image is accepted. */
  public val assets: Set<String> = emptySet(),
  maxLineLength: Int = Limits.LINE_LENGTH,
  /** The app's own components (Step 20). */
  public val components: AppComponents = AppComponents.NONE,
  /** Families of picture names the app looks up when a screen is drawn (Step 20). */
  public val pictures: List<PicturePattern> = emptyList(),
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
  private val maxLineLength = maxLineLength
  private val buffer = LineBuffer(maxLineLength)
  private var accepted = mutableListOf<Statement>()
  private var screenIssues: List<Issue> = emptyList()
  private val index = DocumentIndex()
  private val lineOf = mutableMapOf<String, Int>()

  // Owned by the parser and shared by its documents (see OmniDocument).
  private val nodes = LinkedHashMap<String, OmniNode>()
  private val mutations = LinkedHashMap<String, Mutation>()
  private var state = LinkedHashMap<String, Primitive>()
  private val pending = LinkedHashSet<String>()
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
    screenIssues = validateDocument(accepted, complete = true)
    if (!document.complete) {
      document = document.copy(missing = pending.toSet(), pending = emptySet(), complete = true, revision = document.revision + 1)
    }
    onChange?.invoke(document)
    for (issue in found) {
      reported += issue
      onEvent?.invoke(ParserEvent.Error(issue))
    }
    onEvent?.invoke(ParserEvent.End(found))
    return found
  }

  /**
   * Apply an update from the app's own code to the ended screen (SPEC.md [10.29]-[10.34]): the same lines
   * as a stream, where an id or `$key` the screen has is replaced. Applied whole or not at all. Never pass
   * text a model wrote. Before `end()`, it changes nothing and reports why.
   */
  public fun update(text: String): UpdateResult {
    if (endIssues == null) {
      return UpdateResult(false, listOf(Issue(IssueCode.UPDATE_TOO_LARGE, "updates change an ended screen: end() the stream first")))
    }
    val result = when (val plan = planUpdate(accepted, screenIssues, text, tools, assets, components, pictures, maxLineLength)) {
      is UpdatePlan.Rejected -> UpdateResult(false, plan.issues)
      is UpdatePlan.Applied -> {
        val kept = plan.statements.map { it.definedId }.toSet()
        for (s in accepted) {
          if (s.definedId in kept) continue
          when (s) {
            is Statement.Node -> nodes.remove(s.node.id)
            is Statement.MutationStatement -> if (mutations[s.mutation.target]?.id == s.mutation.id) mutations.remove(s.mutation.target)
            is Statement.State -> {}
          }
        }
        var newState: LinkedHashMap<String, Primitive>? = null
        for (s in plan.assigned) {
          when (s) {
            is Statement.State -> (newState ?: LinkedHashMap(state).also { newState = it })[s.key] = s.value
            is Statement.Node -> nodes[s.node.id] = s.node
            is Statement.MutationStatement -> {
              // A replaced McpMutation may govern another Button now.
              mutations.entries.removeAll { it.value.id == s.mutation.id }
              mutations[s.mutation.target] = s.mutation
            }
          }
        }
        newState?.let { state = it }
        accepted = plan.statements.toMutableList()
        screenIssues = plan.documentIssues
        val count = (document.lastUpdate?.count ?: 0) + 1
        document = document.copy(
          nodes = nodes,
          mutations = mutations,
          state = state,
          missing = missingReferences(plan.statements),
          revision = document.revision + 1,
          lastUpdate = LastUpdate(count, plan.assigned.map { it.definedId }),
        )
        onChange?.invoke(document)
        UpdateResult(true, plan.issues)
      }
    }
    onEvent?.invoke(ParserEvent.Update(result))
    return result
  }

  /** A local state edit from an Input or DateInput (R1). The key must already be declared by the stream. */
  public fun setState(key: String, value: Primitive) {
    val current = document.state[key] ?: return
    if (current == value) return
    // An edit gets a new state map, so a reader holding the old one sees the change.
    state = LinkedHashMap(state).apply { put(key, value) }
    document = document.copy(state = state, revision = document.revision + 1)
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
        if (line == 1 && isNewerMarker(event.text)) {
          val placed = Issue(IssueCode.NEWER_VERSION, "the stream was written for a newer Omni-IR format than this parser's ($FORMAT_VERSION)", line = line)
          reported += placed
          onEvent?.invoke(ParserEvent.Warning(placed))
          document = document.copy(newerVersion = true, revision = document.revision + 1)
        }
        when (val parsed = parseLine(event.text)) {
          LineResult.Empty -> return
          is LineResult.Error -> reject(listOf(parsed.issue), line)
          is LineResult.Statement -> {
            for (warning in parsed.warnings) {
              val placed = warning.copy(line = line)
              reported += placed
              onEvent?.invoke(ParserEvent.Warning(placed))
            }
            when (val result = validateStatement(parsed.statement, tools, assets, components, pictures)) {
              is StatementResult.Failed -> reject(listOf(result.issue), line)
              is StatementResult.Ok -> {
                // The accepted statements are always consistent, so any new issue is caused by this line.
                // The index checks only what the line touches, so a long stream stays linear.
                val conflicts = index.check(result.statement)
                if (conflicts.isNotEmpty()) return reject(conflicts, line)
                accepted += result.statement
                index.add(result.statement)
                val id = result.statement.definedId
                lineOf[id] = line
                val (pending, resolved) = apply(result.statement)
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

  /** Add an accepted statement to the document; returns the references it left pending and the ones it resolved. */
  private fun apply(statement: Statement): Pair<List<String>, List<String>> {
    val newlyPending = mutableListOf<String>()
    val resolved = mutableListOf<String>()
    fun define(id: String) {
      if (pending.remove(id)) resolved += id
    }
    val refs: List<String> = when (statement) {
      is Statement.State -> {
        state[statement.key] = statement.value
        define(statement.key)
        emptyList()
      }
      is Statement.Node -> {
        nodes[statement.node.id] = statement.node
        define(statement.node.id)
        statement.node.children + stateKeys(statement.node.props)
      }
      is Statement.MutationStatement -> {
        mutations[statement.mutation.target] = statement.mutation
        stateKeys(statement.mutation.params)
      }
    }
    for (ref in refs) {
      val known = if (ref.startsWith("$")) ref in state else ref in nodes
      if (!known && pending.add(ref)) newlyPending += ref
    }
    document = document.copy(nodes = nodes, mutations = mutations, state = state, pending = pending, revision = document.revision + 1)
    return newlyPending to resolved
  }
}
