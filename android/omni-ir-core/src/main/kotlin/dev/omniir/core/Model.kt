// The values a parser produces: issues, props, components, McpMutations and the document.
// They mirror packages/core/src (TypeScript) and swift/Sources/OmniIRCore, so all three
// implementations describe a stream the same way.
package dev.omniir.core

public enum class IssueSeverity { ERROR, WARNING }

/** When an issue is found: on its own line, at the end of the stream, or while rendering. */
public enum class IssueStage { LINE, END, RENDERER }

public data class Issue(
  public val code: IssueCode,
  public val message: String,
  /** The component id or `$key` the issue is about, when there is one. */
  public val id: String? = null,
  /** 1-based line number in the stream; null for end-of-stream issues such as `missing_root`. */
  public val line: Int? = null,
) {
  override fun toString(): String = "${line?.let { "line $it" } ?: "end"}: ${code.wireName}: $message"
}

/** A state value: text, a number, true or false, or null. */
public sealed interface Primitive {
  public data class Text(val value: String) : Primitive

  public data class Number(val value: Double) : Primitive

  public data class Bool(val value: Boolean) : Primitive

  public data object Null : Primitive
}

/** A validated prop or McpMutation param. */
public sealed interface PropValue {
  public data class Text(val value: String) : PropValue

  public data class Number(val value: Double) : PropValue

  public data class Bool(val value: Boolean) : PropValue

  public data object Null : PropValue

  /** A `$key` reference, resolved against the document's state when rendering. */
  public data class State(val key: String) : PropValue

  /** A component id (only McpMutation's target). */
  public data class Ref(val id: String) : PropValue

  /** McpMutation params. */
  public data class Record(val entries: Map<String, PropValue>) : PropValue

  /** A list of plain values, such as a Select's options or a TableRow's cells. */
  public data class ListOf(val items: List<PropValue>) : PropValue
}

/** An accepted component. `props` never contains `children`; they are in `children`, in order. */
public data class OmniNode(
  public val id: String,
  public val type: ComponentType,
  public val props: Map<String, PropValue>,
  public val children: List<String>,
  /** For an app's own component (type APP, Step 20): its name, such as "ProductCard". */
  public val appName: String? = null,
  /** For an app component that edits a `$state` (its `value` prop): what that state holds. */
  public val holds: StateHolds? = null,
  /** For an app component declared as a field: it accepts `required` ([8.2]). */
  public val isField: Boolean = false,
)

/** An accepted McpMutation: approval for one Button to call one tool from the app's registry. */
public data class Mutation(
  public val id: String,
  /** The id of the Button it governs. */
  public val target: String,
  public val tool: String,
  public val params: Map<String, PropValue>,
)

/**
 * Everything accepted so far. Each change produces a new document with a higher [revision]. While a
 * stream arrives, documents share the parser's maps, which grow in place: copying them on every line
 * made long streams quadratic (PLAN-HARDENING.md C.2). Read the newest document; copy a map if you
 * need it frozen.
 */
public data class OmniDocument(
  /** Components by id. */
  public val nodes: Map<String, OmniNode> = emptyMap(),
  /** McpMutations by the id of the Button they govern. */
  public val mutations: Map<String, Mutation> = emptyMap(),
  /** Current state: declared by the stream, then edited by Input and DateInput. */
  public val state: Map<String, Primitive> = emptyMap(),
  /** Component ids and `$keys` referenced but not arrived yet. */
  public val pending: Set<String> = emptySet(),
  /** After the end of the stream: references that never arrived. */
  public val missing: Set<String> = emptySet(),
  public val complete: Boolean = false,
  /** Line 1 was a version marker for a newer Omni-IR version than this one (SPEC.md [3.9]). */
  public val newerVersion: Boolean = false,
  /** Increases with every change, so two documents from different moments never compare equal. */
  public val revision: Long = 0,
)

/** One backend action the UI may trigger, with a check for its params. */
public fun interface Tool {
  /** Returns problems with the params (empty when they are valid). */
  public fun validate(params: Map<String, Primitive>): List<String>

  public companion object {
    /** A tool that accepts any params; for tests and demos only. */
    public val acceptsAnything: Tool = Tool { emptyList() }
  }
}

/** Tools by name, such as `"payments.confirm"`. A stream can name only these; it can never add one. */
public typealias ToolRegistry = Map<String, Tool>
