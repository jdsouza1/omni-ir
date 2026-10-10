// The streaming document rules, checked incrementally (PLAN-HARDENING.md C.2).
// Port of DocumentIndex in packages/core/src/schema.ts.
package dev.omniir.core

/** The `input_state_type` issue a bound Input, DateInput, Select or Switch has with this state value, if any. */
private fun inputStateIssue(n: OmniNode, key: String, value: Primitive): Issue? {
  if (n.type == ComponentType.APP) return appStateIssue(n, key, value)
  val text = (value as? Primitive.Text)?.value
  val message = when (n.type) {
    ComponentType.INPUT, ComponentType.SELECT ->
      if (text != null) null else "${n.type.wireName} \"${n.id}\" is bound to $key, which is not a string"
    ComponentType.SWITCH ->
      if (value is Primitive.Bool) null else "Switch \"${n.id}\" is bound to $key, which is not true or false"
    else ->
      if (text != null && (text.isEmpty() || isIsoDate(text))) null
      else "DateInput \"${n.id}\" is bound to $key, which is not a YYYY-MM-DD date or \"\""
  }
  return message?.let { Issue(IssueCode.INPUT_STATE_TYPE, it, n.id) }
}

private val BOUND_EDITORS = setOf(ComponentType.INPUT, ComponentType.DATE_INPUT, ComponentType.SELECT, ComponentType.SWITCH)

private fun listSize(n: OmniNode, prop: String): Int? = (n.props[prop] as? PropValue.ListOf)?.items?.size

/**
 * For a consistent document, `check(s)` returns exactly what `validateDocument(added + s, complete =
 * false)` would, looking only at what `s` touches (its id, its children, its parent, its state keys
 * and the Button it governs), so a long stream stays linear. DocumentIndexTest compares the two on
 * every line of the fuzz corpus.
 */
internal class DocumentIndex {
  private val byId = HashMap<String, Statement>()
  private val state = HashMap<String, Primitive>()

  /** Child id -> the defined node that lists it. */
  private val parentOf = HashMap<String, String>()

  /** `$key` -> the Inputs, DateInputs, Selects and Switches bound to it. */
  private val boundTo = HashMap<String, MutableList<OmniNode>>()

  /** Button id -> the McpMutation governing it. */
  private val governed = HashMap<String, String>()

  private fun node(id: String) = (byId[id] as? Statement.Node)?.node

  private fun boundKey(n: OmniNode) = if (n.type in BOUND_EDITORS) (n.props["value"] as? PropValue.State)?.key else appBoundKey(n)

  fun check(s: Statement): List<Issue> {
    if (s is Statement.State) {
      if (s.key in state) return listOf(Issue(IssueCode.DUPLICATE_ID, "${s.key} is assigned more than once", s.key))
      if (state.size >= Limits.STATE_KEYS) return listOf(tooLarge(s.key))
      return boundTo[s.key].orEmpty().mapNotNull { inputStateIssue(it, s.key, s.value) }
    }
    if (s.definedId in byId) return listOf(Issue(IssueCode.DUPLICATE_ID, "\"${s.definedId}\" is assigned more than once", s.definedId))
    if (byId.size >= Limits.COMPONENTS) return listOf(tooLarge(s.definedId))
    return when (s) {
      is Statement.MutationStatement -> checkMutation(s.mutation)
      is Statement.Node -> checkNode(s.node)
      is Statement.State -> emptyList()
    }
  }

  fun add(s: Statement) {
    when (s) {
      is Statement.State -> state[s.key] = s.value
      is Statement.MutationStatement -> {
        byId[s.definedId] = s
        governed[s.mutation.target] = s.mutation.id
      }
      is Statement.Node -> {
        byId[s.definedId] = s
        for (child in claimedChildren(s.node).first) parentOf[child] = s.node.id
        boundKey(s.node)?.let { boundTo.getOrPut(it) { mutableListOf() } += s.node }
      }
    }
  }

  private fun checkMutation(m: Mutation): List<Issue> {
    val issues = mutableListOf<Issue>()
    // A node listed this id as a child before it arrived; now it turns out to be an McpMutation.
    parentOf[m.id]?.let { issues += Issue(IssueCode.CHILD_NOT_COMPONENT, "\"${m.id}\" is an McpMutation, not a component", it) }
    governed[m.target]?.let { issues += Issue(IssueCode.DUPLICATE_MUTATION, "\"${m.target}\" is already governed by \"$it\"", m.id) }
    return issues
  }

  /** The tree-shape rules for a new node's children list, as validateDocument applies them. */
  private fun claimedChildren(n: OmniNode): Pair<List<String>, List<Issue>> {
    val issues = mutableListOf<Issue>()
    val claimed = mutableListOf<String>()
    val seen = mutableSetOf<String>()
    for (child in n.children) {
      when {
        !seen.add(child) -> issues += Issue(IssueCode.DUPLICATE_CHILD, "\"$child\" appears twice in ${n.id}'s children", n.id)
        child == Catalog.ROOT_ID -> issues += Issue(IssueCode.ROOT_AS_CHILD, "\"${Catalog.ROOT_ID}\" cannot be a child", n.id)
        byId[child] is Statement.MutationStatement -> issues += Issue(IssueCode.CHILD_NOT_COMPONENT, "\"$child\" is an McpMutation, not a component", n.id)
        child in parentOf -> issues += Issue(IssueCode.MULTIPLE_PARENTS, "\"$child\" already belongs to \"${parentOf[child]}\" and cannot also be a child of \"${n.id}\"", n.id)
        else -> claimed += child
      }
    }
    return claimed to issues
  }

  private fun checkNode(n: OmniNode): List<Issue> {
    val (claimed, shapeIssues) = claimedChildren(n)
    val issues = shapeIssues.toMutableList()
    fun lookup(id: String) = if (id == n.id) n else node(id)
    val parent = if (n.id in claimed) n.id else parentOf[n.id]
    val parentNode = parent?.let(::lookup)

    // Cycles: every new edge starts at this node, so a cycle exists only if one of its new children
    // is the node itself or one of its ancestors.
    val ancestors = mutableSetOf(n.id)
    var p = parentOf[n.id]
    while (p != null && ancestors.add(p)) p = parentOf[p]
    if (claimed.any { it in ancestors }) issues += Issue(IssueCode.CYCLE, "\"${n.id}\" contains itself through its children", n.id)

    boundKey(n)?.let { key -> state[key]?.let { value -> inputStateIssue(n, key, value)?.let { issues += it } } }

    // Containers with one kind of item, seen from the new node as a container, as an item, and as the
    // new parent of items it claims.
    for (pair in CONTAINER_PAIRS) {
      if (n.type in pair.containers) {
        for (child in n.children) {
          val c = lookup(child)
          if (c != null && c.type != pair.item) {
            issues += Issue(pair.code, "${n.type.wireName} \"${n.id}\" can only contain ${pair.item.wireName}s, not ${c.type.wireName} \"$child\"", n.id)
          }
        }
      }
      val names = pair.containers.joinToString(" or ") { it.wireName }
      if (parentNode != null && parentNode.id != n.id && parentNode.type in pair.containers && n.type != pair.item) {
        issues += Issue(pair.code, "${parentNode.type.wireName} \"${parentNode.id}\" can only contain ${pair.item.wireName}s, not ${n.type.wireName} \"${n.id}\"", parentNode.id)
      }
      if (n.type == pair.item && parentNode != null && parentNode.type !in pair.containers) {
        issues += Issue(pair.code, "${pair.item.wireName} \"${n.id}\" must be inside a $names, not ${parentNode.type.wireName} \"$parent\"", n.id)
      }
      for (child in claimed) {
        val c = node(child)
        if (c != null && c.type == pair.item && n.type !in pair.containers) {
          issues += Issue(pair.code, "${pair.item.wireName} \"$child\" must be inside a $names, not ${n.type.wireName} \"${n.id}\"", child)
        }
      }
    }

    // A Series has one value per label of its chart; a TableRow one cell per column of its Table.
    fun sizeIssue(holder: OmniNode, item: OmniNode): Issue? {
      if ((holder.type == ComponentType.BAR_CHART || holder.type == ComponentType.LINE_CHART) && item.type == ComponentType.SERIES) {
        val labels = listSize(holder, "labels") ?: return null
        val values = listSize(item, "values") ?: return null
        if (values != labels) {
          return Issue(IssueCode.CHART_MISMATCH, "Series \"${item.id}\" has $values value(s), but ${holder.type.wireName} \"${holder.id}\" has $labels label(s)", item.id)
        }
      }
      if (holder.type == ComponentType.TABLE && item.type == ComponentType.TABLE_ROW) {
        val columns = listSize(holder, "columns") ?: return null
        val cells = listSize(item, "cells") ?: return null
        if (cells != columns) {
          return Issue(IssueCode.TABLE_MISMATCH, "TableRow \"${item.id}\" has $cells cell(s), but Table \"${holder.id}\" has $columns column(s)", item.id)
        }
      }
      return null
    }
    for (child in n.children) lookup(child)?.let { c -> sizeIssue(n, c)?.let { issues += it } }
    if (parentNode != null && parentNode.id != n.id && n.id in parentNode.children) sizeIssue(parentNode, n)?.let { issues += it }

    return issues
  }
}
