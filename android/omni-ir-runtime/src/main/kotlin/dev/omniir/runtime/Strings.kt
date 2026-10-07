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
