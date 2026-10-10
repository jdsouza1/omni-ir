// The renderer's model: an observable document fed by the parser, plus everything a view needs that
// isn't drawing (resolving $state, governance, actions). Port of swift/Sources/OmniIRSwiftUI/Model.
package dev.omniir.runtime

import dev.omniir.core.UpdateResult
import dev.omniir.core.AppComponents
import dev.omniir.core.ComponentType
import dev.omniir.core.PicturePattern
import dev.omniir.core.FieldProblem
import dev.omniir.core.Issue
import dev.omniir.core.IssueCode
import dev.omniir.core.Mutation
import dev.omniir.core.OmniDocument
import dev.omniir.core.OmniNode
import dev.omniir.core.OmniParser
import dev.omniir.core.Primitive
import dev.omniir.core.PropValue
import dev.omniir.core.ToolRegistry
import dev.omniir.core.checkField
import dev.omniir.core.fieldKey
import dev.omniir.core.fieldsReadBy
import dev.omniir.core.isMutating
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

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

/**
 * The app's confirmation for one tool ([9.1]): writes the sentence from the checked params, for example
 * to show an amount as currency. [template] makes one from a sentence whose `{name}` placeholders are
 * filled with the params as plain text. Shown as plain text either way.
 */
public fun interface Confirmation {
  public fun text(params: Map<String, Primitive>): String

  public companion object {
    public fun template(sentence: String): Confirmation = Confirmation { params -> fillTemplate(sentence, params.mapValues { displayText(it.value) }) }
  }
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
  /**
   * The app's confirmation for each tool whose actions need the person's say-so ([9.1]), such as
   * `"payments.confirm" to Confirmation.template("Pay {amount}?")`. Set by the app, never by the stream.
   */
  public val confirm: Map<String, Confirmation> = emptyMap(),
  /** The app's own components (Step 20); pass the same to the view with their composables. */
  public val components: AppComponents = AppComponents.NONE,
  /** Families of picture names the app looks up when a screen is drawn (Step 20). */
  public val pictures: List<PicturePattern> = emptyList(),
) {
  private val parser = OmniParser(tools, assets, components = components, pictures = pictures)
  private val lock = Any()
  private val documentFlow = MutableStateFlow(OmniDocument())
  private val issuesFlow = MutableStateFlow<List<Issue>>(emptyList())
  private val actionsFlow = MutableStateFlow(ActionState())
  private val shownFlow = MutableStateFlow<Set<String>>(emptySet())

  /** Everything accepted so far. */
  public val document: StateFlow<OmniDocument> = documentFlow.asStateFlow()

  /** Every parser error and warning so far, in order. */
  public val issues: StateFlow<List<Issue>> = issuesFlow.asStateFlow()

  public val actions: StateFlow<ActionState> = actionsFlow.asStateFlow()

  /** The fields whose messages show: left by the person, or checked by a press ([8.5]). */
  public val shownFields: StateFlow<Set<String>> = shownFlow.asStateFlow()

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

  /**
   * Apply an update from the app's own code to the ended screen (SPEC.md [10.29]): the same lines, where an
   * id or `$key` the screen has is replaced. Applied whole or not at all. Never pass text a model wrote.
   */
  public fun update(text: String): UpdateResult = synchronized(lock) {
    val result = parser.update(text)
    sync()
    result
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

  /**
   * An app component's props for its view (Step 20): each `$state` replaced by its current value, so a
   * view never sees a reference.
   */
  public fun appProps(node: OmniNode, doc: OmniDocument = document.value): Map<String, PropValue> =
    node.props.mapValues { (_, value) ->
      if (value !is PropValue.State) {
        value
      } else {
        when (val p = doc.state[value.key] ?: Primitive.Null) {
          is Primitive.Text -> PropValue.Text(p.value)
          is Primitive.Number -> PropValue.Number(p.value)
          is Primitive.Bool -> PropValue.Bool(p.value)
          Primitive.Null -> PropValue.Null
        }
      }
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

  // MARK: Fields (SPEC.md section 8)

  /** A field's problem with its current value, shown or not; null when it passes or isn't a field. */
  public fun fieldProblem(id: String, doc: OmniDocument = document.value): FieldProblem? {
    val node = doc.nodes[id] ?: return null
    val key = fieldKey(node) ?: return null
    return checkField(node.type, node.props, doc.state[key])
  }

  /** The problem to show under a field: only once the person has left it or a press checked it ([8.5]). */
  public fun visibleFieldProblem(id: String, doc: OmniDocument = document.value, shown: Set<String> = shownFields.value): FieldProblem? =
    if (id in shown) fieldProblem(id, doc) else null

  /** The person left a field: from now on its message shows while it fails. */
  public fun showField(id: String) {
    shownFlow.update { it + id }
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
   * A press: a Button without an action only reports it. A governed one checks, in order ([9.3]), the
   * fields its params read, its params against the tool, and the app's confirmation, and only then
   * calls the handler. [askConfirmation] shows the app's sentence and returns true when the person
   * confirms; without one, a tool that needs confirmation never runs. Returns the first field that
   * failed, for the view to move focus to ([8.6]), or null.
   */
  public suspend fun press(
    buttonId: String,
    onMutation: suspend (MutationCall) -> Unit,
    report: (RendererEvent) -> Unit,
    askConfirmation: suspend (String) -> Boolean = { false },
  ): String? {
    val doc = document.value
    val node = doc.nodes[buttonId] ?: return null
    if (node.type != ComponentType.BUTTON) return null
    if (!isMutating(node)) {
      report(RendererEvent.Press(buttonId))
      return null
    }
    if (governance(buttonId, doc) !is Governance.Ready || isRunning(buttonId)) return null
    val mutation = doc.mutations[buttonId] ?: return null
    val tool = tools[mutation.tool] ?: return null

    // [8.6]: the fields its params read must pass first; their messages show, and nothing is sent.
    val fields = fieldsReadBy(mutation, doc)
    val failing = fields.firstOrNull { fieldProblem(it, doc) != null }
    if (failing != null) {
      shownFlow.update { it + fields }
      return failing
    }
    val params = params(mutation, doc)
    val problems = tool.validate(params)
    if (problems.isNotEmpty()) {
      val message = problems.joinToString("; ")
      actionsFlow.value = actionsFlow.value.let { it.copy(blocked = it.blocked + (buttonId to (message to params))) }
      report(RendererEvent.Error(Issue(IssueCode.MUTATION_BLOCKED, message, mutation.id)))
      return null
    }
    // [9.1]: the app's own sentence for this tool, written from the checked params as plain text.
    val confirmation = confirm[mutation.tool]
    if (confirmation != null && !askConfirmation(confirmation.text(params))) return null
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
    return null
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
