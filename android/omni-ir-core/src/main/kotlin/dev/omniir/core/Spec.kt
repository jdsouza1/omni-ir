// The shapes Schema.generated.kt is written in: a Kotlin form of the subset of JSON Schema that
// conformance/schema.json uses. The parser validates props by interpreting these.
package dev.omniir.core

/** What a component accepts: its positional arguments, in order, and its props. */
internal data class ComponentSpec(val positional: List<String>, val props: List<PropSpec>)

internal data class PropSpec(val name: String, val required: Boolean, val value: ValueSpec)

internal sealed interface ValueSpec {
  /** Text, with optional length limits (in UTF-16 code units, as in JSON Schema) and a pattern. */
  data class TextValue(val minLength: Int?, val maxLength: Int?, val pattern: String?) : ValueSpec

  /** A finite number, optionally a whole number, within optional limits. */
  data class NumberValue(val minimum: Double?, val maximum: Double?, val integer: Boolean) : ValueSpec

  data object BooleanValue : ValueSpec

  data object NullValue : ValueSpec

  /** One of the listed text values. */
  data class OneOf(val allowed: List<String>) : ValueSpec

  data class TextConstant(val value: String) : ValueSpec

  data class NumberConstant(val value: Double) : ValueSpec

  /** A `$key` reference. */
  data object State : ValueSpec

  /** A component id. */
  data object Ref : ValueSpec

  /** A list of component ids (children). */
  data class RefList(val maxItems: Int?) : ValueSpec

  /** An object with checked keys and values (McpMutation params). */
  data class Record(val key: ValueSpec, val value: ValueSpec) : ValueSpec

  /** Any of these. */
  data class AnyOf(val options: List<ValueSpec>) : ValueSpec
}
