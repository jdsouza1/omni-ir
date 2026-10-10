// Filling the renderer's own words (PLAN-THEMES.md D.2). Port of fillTemplate in
// packages/react/src/catalog/strings.ts.
package dev.omniir.runtime

private val PLACEHOLDER = Regex("""\{([A-Za-z]+)\}""")

/**
 * Fill `{name}` placeholders in one pass. What is inserted is never scanned again, and anything else,
 * including unknown placeholders and `%` codes, is kept as written: no formatting function ever sees
 * the app's wording, so a stray `%d` can't crash the app.
 */
public fun fillTemplate(template: String, values: Map<String, String>): String =
  PLACEHOLDER.replace(template) { match -> values[match.groupValues[1]] ?: match.value }

/** A field problem in these words, with its placeholders such as `{max}` filled (SPEC.md section 8). */
public fun OmniStrings.field(problem: dev.omniir.core.FieldProblem): String {
  val template = when (problem.message) {
    "required" -> required
    "chooseOption" -> chooseOption
    "turnOn" -> turnOn
    "invalidEmail" -> invalidEmail
    "invalidNumber" -> invalidNumber
    "invalidPhone" -> invalidPhone
    "invalidUrl" -> invalidUrl
    "tooShort" -> tooShort
    "tooLong" -> tooLong
    "dateTooEarly" -> dateTooEarly
    "dateTooLate" -> dateTooLate
    else -> required
  }
  return fillTemplate(template, problem.values)
}
