// Form field checks (SPEC.md section 8, Fields, [8.1]–[8.6]): what a renderer says about a field's
// current value. They mirror packages/core/src/fields.ts and swift/Sources/OmniIRCore/Fields.swift;
// conformance/fields holds the shared cases. The checks only read the props the stream declared and
// the person's value: the server still checks every action's params against the tool's own schema.
package dev.omniir.core

/** The renderer's own words for a field problem (keys of its strings, SPEC.md section 8). */
public object FieldMessage {
  public const val REQUIRED: String = "required"
  public const val CHOOSE_OPTION: String = "chooseOption"
  public const val TURN_ON: String = "turnOn"
  public const val INVALID_EMAIL: String = "invalidEmail"
  public const val INVALID_NUMBER: String = "invalidNumber"
  public const val INVALID_PHONE: String = "invalidPhone"
  public const val INVALID_URL: String = "invalidUrl"
  public const val TOO_SHORT: String = "tooShort"
  public const val TOO_LONG: String = "tooLong"
  public const val DATE_TOO_EARLY: String = "dateTooEarly"
  public const val DATE_TOO_LATE: String = "dateTooLate"
}

/** A field problem: a message key and the values for its placeholders, such as `{min}`. */
public data class FieldProblem(
  public val message: String,
  public val values: Map<String, String> = emptyMap(),
)

/** The components that edit a value the checks apply to. */
public val FIELD_TYPES: Set<ComponentType> =
  setOf(ComponentType.INPUT, ComponentType.DATE_INPUT, ComponentType.SELECT, ComponentType.SWITCH)

// JavaScript's white space (what `\s` and trim() mean there), so every renderer trims alike.
private const val JS_SPACE = "\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF"
private val jsSpaces: Set<Char> =
  "\t\n\u000B\u000C\r       　﻿".toSet() + (' '..' ')

private fun jsTrim(text: String): String = text.trim { it in jsSpaces }

private val formats: Map<String, Pair<Regex, String>> = mapOf(
  // Text, @, then a host with at least one dot; no spaces and one @ only.
  "email" to (Regex("[^$JS_SPACE@]+@[^$JS_SPACE@.]+(\\.[^$JS_SPACE@.]+)+") to FieldMessage.INVALID_EMAIL),
  // An optional sign, digits, and an optional decimal part with "." or ",".
  "number" to (Regex("[+-]?[0-9]+([.,][0-9]+)?") to FieldMessage.INVALID_NUMBER),
  // Digits, spaces, brackets, dashes and dots, with an optional leading +; 7 to 15 digits (below).
  "phone" to (Regex("\\+?[0-9 ().-]+") to FieldMessage.INVALID_PHONE),
  // http:// or https://, then a host with a dot, and an optional path; no spaces.
  "url" to (
    Regex("[hH][tT][tT][pP][sS]?://[^$JS_SPACE/?#.]+(\\.[^$JS_SPACE/?#.]+)+([/?#][^$JS_SPACE]*)?") to FieldMessage.INVALID_URL
    ),
)

/** A whole number as JavaScript writes it, so `{min}` reads "3", not "3.0". */
private fun number(n: Double): String = if (n == Math.rint(n) && !n.isInfinite()) n.toLong().toString() else n.toString()

/**
 * The first problem with a field's value, or null when it passes ([8.2]–[8.4]). `props` are the
 * field's props as the stream declared them; `value` is its state's current value. Components that
 * aren't fields always pass.
 */
public fun checkField(type: ComponentType, props: Map<String, PropValue>, value: Primitive?): FieldProblem? {
  val required = (props["required"] as? PropValue.Bool)?.value == true
  return when (type) {
    ComponentType.SWITCH ->
      if (required && (value as? Primitive.Bool)?.value != true) FieldProblem(FieldMessage.TURN_ON) else null
    ComponentType.SELECT -> {
      val options = (props["options"] as? PropValue.ListOf)?.items.orEmpty()
      val chosen = (value as? Primitive.Text)?.value
      if (required && (chosen == null || options.none { it == PropValue.Text(chosen) })) FieldProblem(FieldMessage.CHOOSE_OPTION) else null
    }
    ComponentType.DATE_INPUT -> {
      val date = jsTrim((value as? Primitive.Text)?.value ?: "")
      val min = (props["min"] as? PropValue.Text)?.value
      val max = (props["max"] as? PropValue.Text)?.value
      when {
        date.isEmpty() -> if (required) FieldProblem(FieldMessage.REQUIRED) else null
        // Compared as text in UTF-16 order, like JavaScript's < and >.
        min != null && date < min -> FieldProblem(FieldMessage.DATE_TOO_EARLY, mapOf("min" to min))
        max != null && date > max -> FieldProblem(FieldMessage.DATE_TOO_LATE, mapOf("max" to max))
        else -> null
      }
    }
    ComponentType.INPUT -> checkInput(props, jsTrim((value as? Primitive.Text)?.value ?: ""), required)
    else -> null
  }
}

private fun checkInput(props: Map<String, PropValue>, text: String, required: Boolean): FieldProblem? {
  if (text.isEmpty()) return if (required) FieldProblem(FieldMessage.REQUIRED) else null
  val formatName = (props["format"] as? PropValue.Text)?.value
  formats[formatName]?.let { (pattern, message) -> if (!pattern.matches(text)) return FieldProblem(message) }
  if (formatName == "phone") {
    val digits = text.count { it in '0'..'9' }
    if (digits < 7 || digits > 15) return FieldProblem(FieldMessage.INVALID_PHONE)
  }
  // Unicode code points, as people count characters.
  val length = text.codePointCount(0, text.length)
  val minLength = (props["minLength"] as? PropValue.Number)?.value
  val maxLength = (props["maxLength"] as? PropValue.Number)?.value
  if (minLength != null && length < minLength) return FieldProblem(FieldMessage.TOO_SHORT, mapOf("min" to number(minLength)))
  if (maxLength != null && length > maxLength) return FieldProblem(FieldMessage.TOO_LONG, mapOf("max" to number(maxLength)))
  return null
}

/** The `$key` a field edits, or null for a component that isn't a field. */
public fun fieldKey(node: OmniNode): String? =
  if (node.type in FIELD_TYPES) (node.props["value"] as? PropValue.State)?.key else null

/**
 * The fields a governed Button's press checks ([8.6]): those whose `$key` its McpMutation's params
 * read, in the order their lines arrived.
 */
public fun fieldsReadBy(mutation: Mutation, document: OmniDocument): List<String> {
  val keys = mutation.params.values.mapNotNull { (it as? PropValue.State)?.key }.toSet()
  if (keys.isEmpty()) return emptyList()
  return document.nodes.values.filter { node -> fieldKey(node)?.let { it in keys } == true }.map { it.id }
}
