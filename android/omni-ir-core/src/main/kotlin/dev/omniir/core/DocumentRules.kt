// Cross-line rules for a list of individually validated statements, in stream order.
// Port of validateDocument in packages/core/src/schema.ts.
package dev.omniir.core

/**
 * `complete = false` while streaming checks only rules a later line can never fix; `true` at the end
 * of the stream also checks dangling references, the root and governance.
 */
internal fun validateDocument(statements: List<Statement>, complete: Boolean): List<Issue> {
  val issues = mutableListOf<Issue>()
  val byId = linkedMapOf<String, Statement>()
  val state = mutableMapOf<String, Primitive>()

  for (s in statements) {
    if (s is Statement.State) {
      if (s.key in state) issues += Issue(IssueCode.DUPLICATE_ID, "${s.key} is assigned more than once", s.key)
      else state[s.key] = s.value
    } else if (s.definedId in byId) {
      issues += Issue(IssueCode.DUPLICATE_ID, "\"${s.definedId}\" is assigned more than once", s.definedId)
    } else {
      byId[s.definedId] = s
    }
  }

  val nodes = byId.values.filterIsInstance<Statement.Node>().map { it.node }
  val mutations = byId.values.filterIsInstance<Statement.MutationStatement>().map { it.mutation }
  fun node(id: String) = (byId[id] as? Statement.Node)?.node

  // Tree shape: one parent per node, no repeats in a children list, root is never a child.
  val parentOf = mutableMapOf<String, String>()
  for (n in nodes) {
    val seen = mutableSetOf<String>()
    for (child in n.children) {
      when {
        !seen.add(child) -> issues += Issue(IssueCode.DUPLICATE_CHILD, "\"$child\" appears twice in ${n.id}'s children", n.id)
        child == Catalog.ROOT_ID -> issues += Issue(IssueCode.ROOT_AS_CHILD, "\"${Catalog.ROOT_ID}\" cannot be a child", n.id)
        byId[child] is Statement.MutationStatement -> issues += Issue(IssueCode.CHILD_NOT_COMPONENT, "\"$child\" is an McpMutation, not a component", n.id)
        child in parentOf -> issues += Issue(IssueCode.MULTIPLE_PARENTS, "\"$child\" already belongs to \"${parentOf[child]}\" and cannot also be a child of \"${n.id}\"", n.id)
        else -> parentOf[child] = n.id
      }
    }
  }

  // Cycles: follow parent links upward; returning to the start means a cycle.
  val reported = mutableSetOf<String>()
  for (n in nodes) {
    val path = mutableSetOf(n.id)
    var current = parentOf[n.id]
    while (current != null && current !in path) {
      path += current
      current = parentOf[current]
    }
    if (current == n.id && n.id !in reported) {
      reported += path
      issues += Issue(IssueCode.CYCLE, "\"${n.id}\" contains itself through its children", n.id)
    }
  }

  // Inputs edit text, so their state must hold a string; DateInputs need a YYYY-MM-DD date or "".
  for (n in nodes) {
    if (n.type != ComponentType.INPUT && n.type != ComponentType.DATE_INPUT) continue
    val key = (n.props["value"] as? PropValue.State)?.key ?: continue
    val value = state[key] ?: continue
    val text = (value as? Primitive.Text)?.value
    val ok = if (n.type == ComponentType.INPUT) text != null else text != null && (text.isEmpty() || isIsoDate(text))
    if (!ok) {
      val message = if (n.type == ComponentType.INPUT) "Input \"${n.id}\" is bound to $key, which is not a string"
      else "DateInput \"${n.id}\" is bound to $key, which is not a YYYY-MM-DD date or \"\""
      issues += Issue(IssueCode.INPUT_STATE_TYPE, message, n.id)
    }
  }

  // A List holds only ListItems, and a ListItem only sits in a List.
  for (n in nodes) {
    if (n.type == ComponentType.LIST) {
      for (child in n.children) {
        val c = node(child)
        if (c != null && c.type != ComponentType.LIST_ITEM) {
          issues += Issue(IssueCode.LIST_MISMATCH, "List \"${n.id}\" can only contain ListItems, not ${c.type.wireName} \"$child\"", n.id)
        }
      }
    }
    if (n.type == ComponentType.LIST_ITEM) {
      val parent = parentOf[n.id]
      val p = parent?.let(::node)
      if (p != null && p.type != ComponentType.LIST) {
        issues += Issue(IssueCode.LIST_MISMATCH, "ListItem \"${n.id}\" must be inside a List, not ${p.type.wireName} \"$parent\"", n.id)
      }
    }
  }

  val governed = mutableMapOf<String, String>()
  for (m in mutations) {
    val existing = governed[m.target]
    if (existing != null) issues += Issue(IssueCode.DUPLICATE_MUTATION, "\"${m.target}\" is already governed by \"$existing\"", m.id)
    else governed[m.target] = m.id
  }

  if (!complete) return issues

  when (byId[Catalog.ROOT_ID]) {
    null -> issues += Issue(IssueCode.MISSING_ROOT, "no \"${Catalog.ROOT_ID} = …\" line was received")
    is Statement.MutationStatement -> issues += Issue(IssueCode.ROOT_NOT_COMPONENT, "\"${Catalog.ROOT_ID}\" must be a component, not an McpMutation", Catalog.ROOT_ID)
    else -> {}
  }

  for (n in nodes) {
    for (child in n.children) {
      // Reported against the node holding the reference: it has a line, the missing id never did.
      if (child !in byId) issues += Issue(IssueCode.DANGLING_REF, "\"${n.id}\" references \"$child\", which never arrived", n.id)
    }
  }

  val uses = nodes.map { it.id to stateKeys(it.props) } + mutations.map { it.id to stateKeys(it.params) }
  for ((id, keys) in uses) {
    for (key in keys) if (key !in state) issues += Issue(IssueCode.MISSING_STATE, "\"$id\" uses $key, which was never declared", id)
  }

  for (m in mutations) {
    if (m.target !in byId) {
      issues += Issue(IssueCode.DANGLING_REF, "\"${m.id}\" targets \"${m.target}\", which never arrived", m.id)
    } else if (node(m.target)?.let(::isMutating) != true) {
      issues += Issue(IssueCode.MUTATION_TARGET_NOT_INTERACTIVE, "\"${m.id}\" targets \"${m.target}\", which has no action to govern", m.id)
    }
  }

  for (n in nodes) {
    if (isMutating(n) && n.id !in governed) {
      issues += Issue(IssueCode.UNGOVERNED_MUTATION, "\"${n.id}\" has an action but is not wrapped by an McpMutation", n.id)
    }
  }

  return issues
}

/** True when a component triggers a backend action, so it must be governed by an McpMutation. */
public fun isMutating(node: OmniNode): Boolean = node.type == ComponentType.BUTTON && "action" in node.props

/** Every `$key` a set of props or params reads, in a stable order. */
internal fun stateKeys(values: Map<String, PropValue>): List<String> =
  values.keys.sorted().mapNotNull { (values[it] as? PropValue.State)?.key }

/** `^\d{4}-\d{2}-\d{2}$` with ASCII digits. */
public fun isIsoDate(s: String): Boolean =
  s.length == 10 && s[4] == '-' && s[7] == '-' && listOf(0, 1, 2, 3, 5, 6, 8, 9).all { s[it] in '0'..'9' }
