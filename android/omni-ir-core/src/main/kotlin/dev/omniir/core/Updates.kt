// Updates (SPEC.md [10.29]-[10.34]): Omni-IR text from the app's own code that changes a screen after
// its stream has ended. Port of packages/core/src/updates.ts: the same lines as a stream, where an id
// or $key the screen has is replaced; checked on its own lines, then as the whole screen it would
// leave, and applied whole or not at all.
package dev.omniir.core

/** At most this many lines in one update, blank and comment lines included ([10.30]). */
public const val MAX_UPDATE_LINES: Int = 2000

/** Whether an update changed the screen (a rejected one changes nothing), with its issues; lines count from 1 in the update. */
public data class UpdateResult(val applied: Boolean, val issues: List<Issue>)

/** The last update applied: how many so far, and the ids and `$keys` it assigned (for announcing changed Notices, [8.8]). */
public data class LastUpdate(val count: Int, val assigned: List<String>)

internal sealed interface UpdatePlan {
  val issues: List<Issue>

  data class Rejected(override val issues: List<Issue>) : UpdatePlan

  data class Applied(
    override val issues: List<Issue>,
    /** The screen's statements after the update, in order ([10.32]). */
    val statements: List<Statement>,
    /** What the update assigned and the screen kept. */
    val assigned: List<Statement>,
    /** The screen's document errors after the update: the baseline for the next one. */
    val documentIssues: List<Issue>,
  ) : UpdatePlan
}

private fun issueKey(i: Issue) = "${i.code.wireName}\u0000${i.id ?: ""}"

private fun boundKeyOf(n: OmniNode): String? =
  if (n.type == ComponentType.INPUT || n.type == ComponentType.DATE_INPUT || n.type == ComponentType.SELECT || n.type == ComponentType.SWITCH) {
    (n.props["value"] as? PropValue.State)?.key
  } else {
    appBoundKey(n)
  }

internal fun planUpdate(
  current: List<Statement>,
  baseline: List<Issue>,
  text: String,
  tools: ToolRegistry,
  assets: Set<String>,
  components: AppComponents,
  pictures: List<PicturePattern>,
  maxLineLength: Int,
): UpdatePlan {
  val buffer = LineBuffer(maxLineLength)
  val events = buffer.push(text) + buffer.end()
  if (events.size > MAX_UPDATE_LINES) {
    return UpdatePlan.Rejected(listOf(Issue(IssueCode.UPDATE_TOO_LARGE, "an update may hold at most $MAX_UPDATE_LINES lines (this one has ${events.size})")))
  }

  // Each line on its own: grammar, catalog, props, tools, pictures ([10.32]); each id once ([10.30]).
  val issues = mutableListOf<Issue>()
  val assigned = mutableListOf<Statement>()
  val lineOf = mutableMapOf<String, Int>()
  for (event in events) {
    when (event) {
      is LineEvent.Overflow -> issues += Issue(IssueCode.LINE_TOO_LONG, "line is longer than the limit (${event.length} characters seen)", line = event.number)
      is LineEvent.Line -> {
        val line = event.number
        when (val parsed = parseLine(event.text)) {
          LineResult.Empty -> {}
          is LineResult.Error -> issues += parsed.issue.copy(line = line)
          is LineResult.Statement -> {
            issues += parsed.warnings.map { it.copy(line = line) }
            when (val result = validateStatement(parsed.statement, tools, assets, components, pictures)) {
              is StatementResult.Failed -> issues += result.issue.copy(line = line)
              is StatementResult.Ok -> {
                val key = result.statement.definedId
                if (key in lineOf) {
                  issues += Issue(IssueCode.DUPLICATE_ID, "$key is assigned more than once in this update", key, line)
                } else {
                  lineOf[key] = line
                  assigned += result.statement
                }
              }
            }
          }
        }
      }
    }
  }
  fun failed() = issues.any { it.code.severity == IssueSeverity.ERROR }
  if (failed()) return UpdatePlan.Rejected(issues)

  // The screen it would leave: replaced lines keep their place, new ones follow in order ([10.32]).
  val byKey = LinkedHashMap<String, Statement>()
  for (s in current) byKey[s.definedId] = s
  for (s in assigned) byKey[s.definedId] = s

  // What the person enters belongs to them: no $key a field reads, before or after ([10.34]).
  val readByField = (current + byKey.values).mapNotNull { (it as? Statement.Node)?.node?.let(::boundKeyOf) }.toSet()
  val existing = current.mapNotNull { (it as? Statement.State)?.key }.toSet()
  for (s in assigned) {
    if (s is Statement.State && s.key in existing && s.key in readByField) {
      issues += Issue(IssueCode.LIVE_FIELD_CONFLICT, "${s.key} is read by a field, so an update can't change it", s.key, lineOf[s.key])
    }
  }
  if (failed()) return UpdatePlan.Rejected(issues)

  // Keep only what root reaches, and McpMutations whose targets stay Buttons with an action ([10.31]).
  val reachable = HashSet<String>()
  val stack = ArrayDeque(listOf(Catalog.ROOT_ID))
  while (stack.isNotEmpty()) {
    val id = stack.removeLast()
    val s = byKey[id]
    if (id in reachable || s !is Statement.Node) continue
    reachable += id
    for (child in s.node.children.asReversed()) stack.addLast(child)
  }
  fun governs(target: String): Boolean {
    val t = byKey[target]
    return target in reachable && t is Statement.Node && isMutating(t.node)
  }
  val statements = byKey.values.filter {
    when (it) {
      is Statement.State -> true
      is Statement.Node -> it.node.id in reachable
      is Statement.MutationStatement -> governs(it.mutation.target)
    }
  }
  val kept = statements.map { it.definedId }.toSet()

  // The whole screen, as at end of stream; only errors it didn't have stop the update ([10.33]).
  val documentIssues = validateDocument(statements, complete = true)
  val before = baseline.map(::issueKey).toSet()
  for (issue in documentIssues) {
    if (issueKey(issue) in before) continue
    val line = issue.id?.let { lineOf[it] }
    issues += if (line != null) issue.copy(line = line) else issue
  }
  if (failed()) return UpdatePlan.Rejected(issues)
  return UpdatePlan.Applied(issues, statements, assigned.filter { it.definedId in kept }, documentIssues)
}

/** The references a screen's components and McpMutations make that nothing defines (its `missing`). */
internal fun missingReferences(statements: List<Statement>): Set<String> {
  val ids = HashSet<String>()
  val keys = HashSet<String>()
  for (s in statements) if (s is Statement.State) keys += s.key else ids += s.definedId
  val missing = LinkedHashSet<String>()
  for (s in statements) {
    when (s) {
      is Statement.State -> {}
      is Statement.Node -> {
        for (child in s.node.children) if (child !in ids) missing += child
        for (key in stateKeys(s.node.props)) if (key !in keys) missing += key
      }
      is Statement.MutationStatement -> for (key in stateKeys(s.mutation.params)) if (key !in keys) missing += key
    }
  }
  return missing
}
