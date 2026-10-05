// The renderer's model: an observable document fed by the parser, plus everything a view needs that
// isn't drawing (resolving $state, governance, actions). Port of swift/Sources/OmniIRSwiftUI/Model.
package dev.omniir.runtime

import dev.omniir.core.ComponentType
import dev.omniir.core.Issue
import dev.omniir.core.IssueCode
import dev.omniir.core.Mutation
import dev.omniir.core.OmniDocument
import dev.omniir.core.OmniNode
import dev.omniir.core.OmniParser
import dev.omniir.core.Primitive
import dev.omniir.core.PropValue
import dev.omniir.core.ToolRegistry
import dev.omniir.core.isMutating
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** A governed action, ready to send. Params have their `$state` values filled in and passed the tool's check. */
public data class MutationCall(
  /** The McpMutation's own id. */
  public val id: String,
  /** The Button it governs. */
  public val target: String,
  public val tool: String,
  public val params: Map<String, Primitive>,
)

public sealed interface RendererEvent {
  /** `mutation_blocked` or `handler_failed`. */
  public data class Error(val issue: Issue) : RendererEvent

  /** A Button without an action was pressed: purely local, it never reaches the backend. */
  public data class Press(val id: String) : RendererEvent
}

/** What one id shows right now. */
public sealed interface Slot {
  public data class Node(val node: OmniNode) : Slot

  /** Referenced but not arrived yet: a placeholder. */
  public data object Pending : Slot

  /** The stream ended without it: a fallback. */
  public data object Missing : Slot
}

/** Whether a Button with an action may be pressed. */
public sealed interface Governance {
  /** No McpMutation has approved it (yet): disabled. */
  public data object Ungoverned : Governance

  /** Its McpMutation names a tool the app doesn't allow: disabled, with a message. */
  public data class NotPermitted(val message: String) : Governance

  public data class Ready(val tool: String) : Governance

  /** The last press failed the tool's check; it stays blocked until a value it used changes. */
  public data class Blocked(val tool: String, val message: String) : Governance
}

/** Per-button action state the views observe: blocked presses and actions in flight. */
public data class ActionState(
  val blocked: Map<String, Pair<String, Map<String, Primitive>>> = emptyMap(),
  val running: Set<String> = emptySet(),
)

/**
 * Feed it with `write` as the stream arrives; observe `document`, `issues` and `actions`. Safe to call
 * from any thread: changes are made one at a time and published as new immutable values.
 */
public class OmniStore(
  /** The tools a screen may call, each with its params check. */
  public val tools: ToolRegistry,
  /** Names of the pictures the app provides. */
  public val assets: Set<String> = emptySet(),
) {
  private val parser = OmniParser(tools, assets)
  private val lock = Any()
  private val documentFlow = MutableStateFlow(OmniDocument())
  private val issuesFlow = MutableStateFlow<List<Issue>>(emptyList())
  private val actionsFlow = MutableStateFlow(ActionState())

  /** Everything accepted so far. */
  public val document: StateFlow<OmniDocument> = documentFlow.asStateFlow()

  /** Every parser error and warning so far, in order. */
  public val issues: StateFlow<List<Issue>> = issuesFlow.asStateFlow()

  public val actions: StateFlow<ActionState> = actionsFlow.asStateFlow()

  // MARK: Feeding the stream

  /** Write text as it arrives; it may end anywhere, even in the middle of a line. */
  public fun write(text: String): Unit = synchronized(lock) {
    parser.write(text)
    sync()
  }

  /** Write UTF-8 bytes as they arrive. */
  public fun write(bytes: ByteArray): Unit = synchronized(lock) {
    parser.write(bytes)
    sync()
  }

  /** End of stream: pending parts become fallbacks. Returns the end-of-stream issues. */
  public fun end(): List<Issue> = synchronized(lock) {
    val found = parser.end()
    sync()
    found
  }

  private fun sync() {
    documentFlow.value = parser.document
    issuesFlow.value = parser.issues
  }

  // MARK: Reading for display

  public fun slot(id: String, doc: OmniDocument = document.value): Slot =
    doc.nodes[id]?.let { Slot.Node(it) } ?: if (doc.complete) Slot.Missing else Slot.Pending

  /** A prop's value, with a `$state` reference replaced by the state's current value. */
  public fun resolve(value: PropValue?, doc: OmniDocument = document.value): Primitive? = when (value) {
    is PropValue.Text -> Primitive.Text(value.value)
    is PropValue.Number -> Primitive.Number(value.value)
    is PropValue.Bool -> Primitive.Bool(value.value)
    PropValue.Null -> Primitive.Null
    is PropValue.State -> doc.state[value.key] ?: Primitive.Null
    else -> null
  }

  /** A prop as display text: state resolved, numbers as JavaScript writes them, null as nothing. */
  public fun text(value: PropValue?, doc: OmniDocument = document.value): String = resolve(value, doc)?.let(::displayText) ?: ""

  // MARK: Editing state (Input, DateInput)

  /** The text held by an Input's or DateInput's `$key` ("" when it holds anything else). */
  public fun stateText(key: String, doc: OmniDocument = document.value): String = (doc.state[key] as? Primitive.Text)?.value ?: ""

  /** A Switch's `$key`: true only when it holds `true`. */
  public fun stateBool(key: String, doc: OmniDocument = document.value): Boolean = (doc.state[key] as? Primitive.Bool)?.value == true

  /** A Select's chosen option, or "" when its `$key` holds anything that isn't one of the options. */
  public fun chosenOption(key: String, options: List<String>, doc: OmniDocument = document.value): String =
    stateText(key, doc).takeIf { it in options } ?: ""

  /** A chart's Series that have arrived, in order, with their position among the chart's children. */
  public fun chartSeries(ids: List<String>, doc: OmniDocument = document.value): List<ChartSeries> =
    ids.mapIndexedNotNull { index, id ->
      val node = doc.nodes[id]?.takeIf { it.type == ComponentType.SERIES } ?: return@mapIndexedNotNull null
      val name = (node.props["name"] as? PropValue.Text)?.value ?: return@mapIndexedNotNull null
      val values = (node.props["values"] as? PropValue.ListOf)?.items?.mapNotNull { (it as? PropValue.Number)?.value } ?: return@mapIndexedNotNull null
      ChartSeries(id, index, name, values)
    }

  /** A pie chart's Slices that have arrived, in order, with their position among its children. */
  public fun chartSlices(ids: List<String>, doc: OmniDocument = document.value): List<ChartSlice> =
    ids.mapIndexedNotNull { index, id ->
      val node = doc.nodes[id]?.takeIf { it.type == ComponentType.SLICE } ?: return@mapIndexedNotNull null
      val name = (node.props["name"] as? PropValue.Text)?.value ?: return@mapIndexedNotNull null
      val value = (node.props["value"] as? PropValue.Number)?.value ?: return@mapIndexedNotNull null
      ChartSlice(id, index, name, value)
    }

  /** The labels of a Tabs' children, in order; null for a Tab that hasn't arrived yet. */
  public fun tabLabels(ids: List<String>, doc: OmniDocument = document.value): List<String?> =
    ids.map { id -> doc.nodes[id]?.takeIf { it.type == ComponentType.TAB }?.let { (it.props["label"] as? PropValue.Text)?.value } }

  /** A local edit (R1): it never calls the backend by itself. */
  public fun setState(key: String, value: Primitive): Unit = synchronized(lock) {
    parser.setState(key, value)
    sync()
  }

  // MARK: Actions (McpMutation governance)

  public fun governance(buttonId: String, doc: OmniDocument = document.value, actions: ActionState = this.actions.value): Governance {
    val mutation = doc.mutations[buttonId] ?: return Governance.Ungoverned
    // Second line of defence: the parser already rejects unknown tools, but check again.
    if (mutation.tool !in tools) return Governance.NotPermitted("\"${mutation.tool}\" is not a permitted action")
    val blocked = actions.blocked[buttonId]
    if (blocked != null && blocked.second == params(mutation, doc)) return Governance.Blocked(mutation.tool, blocked.first)
    return Governance.Ready(mutation.tool)
  }

  /** True while the backend handles this Button's action, so it can't be sent twice. */
  public fun isRunning(buttonId: String): Boolean = buttonId in actions.value.running

  /**
   * A press: a Button without an action only reports it; a governed one fills in its params, checks
   * them with the tool, and only then calls the handler.
   */
  public suspend fun press(buttonId: String, onMutation: suspend (MutationCall) -> Unit, report: (RendererEvent) -> Unit) {
    val doc = document.value
    val node = doc.nodes[buttonId] ?: return
    if (node.type != dev.omniir.core.ComponentType.BUTTON) return
    if (!isMutating(node)) return report(RendererEvent.Press(buttonId))
    if (governance(buttonId, doc) !is Governance.Ready || isRunning(buttonId)) return
    val mutation = doc.mutations[buttonId] ?: return
    val tool = tools[mutation.tool] ?: return

    val params = params(mutation, doc)
    val problems = tool.validate(params)
    if (problems.isNotEmpty()) {
      val message = problems.joinToString("; ")
      actionsFlow.value = actionsFlow.value.let { it.copy(blocked = it.blocked + (buttonId to (message to params))) }
      return report(RendererEvent.Error(Issue(IssueCode.MUTATION_BLOCKED, message, mutation.id)))
    }
    actionsFlow.value = actionsFlow.value.let { it.copy(running = it.running + buttonId) }
    try {
      onMutation(MutationCall(mutation.id, mutation.target, mutation.tool, params))
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      report(RendererEvent.Error(Issue(IssueCode.HANDLER_FAILED, e.message ?: e.toString(), buttonId)))
    } finally {
      actionsFlow.value = actionsFlow.value.let { it.copy(running = it.running - buttonId) }
    }
  }

  private fun params(mutation: Mutation, doc: OmniDocument): Map<String, Primitive> =
    mutation.params.mapValues { resolve(it.value, doc) ?: Primitive.Null }
}

/** A state value as text, the way the web renderer shows it. */
public fun displayText(value: Primitive): String = when (value) {
  is Primitive.Text -> value.value
  is Primitive.Number -> jsNumberText(value.value)
  is Primitive.Bool -> if (value.value) "true" else "false"
  Primitive.Null -> ""
}

/** A number as JavaScript's `String(n)` writes it: no ".0" on whole numbers. */
internal fun jsNumberText(n: Double): String =
  if (n.isFinite() && n == Math.rint(n) && kotlin.math.abs(n) < 1e21) n.toLong().toString() else n.toString()

/** A Series that has arrived; [index] is its position among the chart's children (its colour). */
public data class ChartSeries(val id: String, val index: Int, val name: String, val values: List<Double>)

/** A Slice that has arrived; [index] is its position among the pie chart's children. */
public data class ChartSlice(val id: String, val index: Int, val name: String, val value: Double)
