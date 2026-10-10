// The streaming document rules, checked incrementally (PLAN-HARDENING.md C.2).
// Port of DocumentIndex in packages/core/src/schema.ts.

/// The `input_state_type` issue a bound Input, DateInput, Select or Switch has with this state value, if any.
private func inputStateIssue(_ n: OmniNode, key: String, value: Primitive) -> Issue? {
  if n.type == .app { return appStateIssue(n, key: key, value: value) }
  let message: String
  switch n.type {
  case .input, .select:
    if case .text = value { return nil }
    message = "\(n.type.rawValue) \"\(n.id)\" is bound to \(key), which is not a string"
  case .switch:
    if case .bool = value { return nil }
    message = "Switch \"\(n.id)\" is bound to \(key), which is not true or false"
  default:
    if case .text(let s) = value, s.isEmpty || isISODate(s) { return nil }
    message = "DateInput \"\(n.id)\" is bound to \(key), which is not a YYYY-MM-DD date or \"\""
  }
  return Issue(code: .inputStateType, message: message, id: n.id)
}

private func listCount(_ n: OmniNode, _ prop: String) -> Int? {
  if case .list(let items)? = n.props[prop] { items.count } else { nil }
}

/// For a consistent document, `check(s)` returns exactly what `validateDocument(added + [s], complete:
/// false)` would, looking only at what `s` touches (its id, its children, its parent, its state keys
/// and the Button it governs), so a long stream stays linear. DocumentIndexTests compares the two on
/// every line of the fuzz corpus.
struct DocumentIndex {
  private var byId: [String: Statement] = [:]
  private var state: [String: Primitive] = [:]
  /// Child id -> the defined node that lists it.
  private var parentOf: [String: String] = [:]
  /// `$key` -> the Inputs, DateInputs, Selects and Switches bound to it.
  private var boundTo: [String: [OmniNode]] = [:]
  /// Button id -> the McpMutation governing it.
  private var governed: [String: String] = [:]

  private func node(_ id: String) -> OmniNode? { if case .node(let n)? = byId[id] { n } else { nil } }

  private func boundKey(_ n: OmniNode) -> String? {
    guard [.input, .dateInput, .select, .switch].contains(n.type), case .state(let key)? = n.props["value"] else { return appBoundKey(n) }
    return key
  }

  func check(_ s: Statement) -> [Issue] {
    switch s {
    case .state(let key, let value):
      if state[key] != nil { return [Issue(code: .duplicateId, message: "\(key) is assigned more than once", id: key)] }
      if state.count >= Limits.stateKeys { return [tooLarge(key)] }
      return (boundTo[key] ?? []).compactMap { inputStateIssue($0, key: key, value: value) }
    case .node(let n):
      if byId[n.id] != nil { return [Issue(code: .duplicateId, message: "\"\(n.id)\" is assigned more than once", id: n.id)] }
      if byId.count >= Limits.components { return [tooLarge(n.id)] }
      return checkNode(n)
    case .mutation(let m):
      if byId[m.id] != nil { return [Issue(code: .duplicateId, message: "\"\(m.id)\" is assigned more than once", id: m.id)] }
      if byId.count >= Limits.components { return [tooLarge(m.id)] }
      return checkMutation(m)
    }
  }

  mutating func add(_ s: Statement) {
    switch s {
    case .state(let key, let value):
      state[key] = value
    case .mutation(let m):
      byId[m.id] = s
      governed[m.target] = m.id
    case .node(let n):
      byId[n.id] = s
      for child in claimedChildren(n).claimed { parentOf[child] = n.id }
      if let key = boundKey(n) { boundTo[key, default: []].append(n) }
    }
  }

  private func checkMutation(_ m: Mutation) -> [Issue] {
    var issues: [Issue] = []
    // A node listed this id as a child before it arrived; now it turns out to be an McpMutation.
    if let lister = parentOf[m.id] {
      issues.append(Issue(code: .childNotComponent, message: "\"\(m.id)\" is an McpMutation, not a component", id: lister))
    }
    if let existing = governed[m.target] {
      issues.append(Issue(code: .duplicateMutation, message: "\"\(m.target)\" is already governed by \"\(existing)\"", id: m.id))
    }
    return issues
  }

  /// The tree-shape rules for a new node's children list, as validateDocument applies them.
  private func claimedChildren(_ n: OmniNode) -> (claimed: [String], issues: [Issue]) {
    var issues: [Issue] = []
    var claimed: [String] = []
    var seen = Set<String>()
    for child in n.children {
      if !seen.insert(child).inserted {
        issues.append(Issue(code: .duplicateChild, message: "\"\(child)\" appears twice in \(n.id)'s children", id: n.id))
      } else if child == Catalog.rootId {
        issues.append(Issue(code: .rootAsChild, message: "\"\(Catalog.rootId)\" cannot be a child", id: n.id))
      } else if case .mutation? = byId[child] {
        issues.append(Issue(code: .childNotComponent, message: "\"\(child)\" is an McpMutation, not a component", id: n.id))
      } else if let existing = parentOf[child] {
        issues.append(Issue(code: .multipleParents, message: "\"\(child)\" already belongs to \"\(existing)\" and cannot also be a child of \"\(n.id)\"", id: n.id))
      } else {
        claimed.append(child)
      }
    }
    return (claimed, issues)
  }

  private func checkNode(_ n: OmniNode) -> [Issue] {
    let (claimed, shapeIssues) = claimedChildren(n)
    var issues = shapeIssues
    func lookup(_ id: String) -> OmniNode? { id == n.id ? n : node(id) }
    let parent = claimed.contains(n.id) ? n.id : parentOf[n.id]
    let parentNode = parent.flatMap(lookup)

    // Cycles: every new edge starts at this node, so a cycle exists only if one of its new children
    // is the node itself or one of its ancestors.
    var ancestors: Set<String> = [n.id]
    var p = parentOf[n.id]
    while let current = p, ancestors.insert(current).inserted { p = parentOf[current] }
    if claimed.contains(where: { ancestors.contains($0) }) {
      issues.append(Issue(code: .cycle, message: "\"\(n.id)\" contains itself through its children", id: n.id))
    }

    if let key = boundKey(n), let value = state[key], let issue = inputStateIssue(n, key: key, value: value) { issues.append(issue) }

    // Containers with one kind of item, seen from the new node as a container, as an item, and as the
    // new parent of items it claims.
    for pair in containerPairs {
      if pair.containers.contains(n.type) {
        for child in n.children {
          if let c = lookup(child), c.type != pair.item {
            issues.append(Issue(code: pair.code, message: "\(n.type.rawValue) \"\(n.id)\" can only contain \(pair.item.rawValue)s, not \(c.type.rawValue) \"\(child)\"", id: n.id))
          }
        }
      }
      let names = pair.containers.map(\.rawValue).joined(separator: " or ")
      if let pn = parentNode, pn.id != n.id, pair.containers.contains(pn.type), n.type != pair.item {
        issues.append(Issue(code: pair.code, message: "\(pn.type.rawValue) \"\(pn.id)\" can only contain \(pair.item.rawValue)s, not \(n.type.rawValue) \"\(n.id)\"", id: pn.id))
      }
      if n.type == pair.item, let pn = parentNode, !pair.containers.contains(pn.type) {
        issues.append(Issue(code: pair.code, message: "\(pair.item.rawValue) \"\(n.id)\" must be inside a \(names), not \(pn.type.rawValue) \"\(parent ?? "")\"", id: n.id))
      }
      for child in claimed {
        if let c = node(child), c.type == pair.item, !pair.containers.contains(n.type) {
          issues.append(Issue(code: pair.code, message: "\(pair.item.rawValue) \"\(child)\" must be inside a \(names), not \(n.type.rawValue) \"\(n.id)\"", id: child))
        }
      }
    }

    // A Series has one value per label of its chart; a TableRow one cell per column of its Table.
    func sizeIssue(_ holder: OmniNode, _ item: OmniNode) -> Issue? {
      if [.barChart, .lineChart].contains(holder.type), item.type == .series,
        let labels = listCount(holder, "labels"), let values = listCount(item, "values"), values != labels
      {
        return Issue(code: .chartMismatch, message: "Series \"\(item.id)\" has \(values) value(s), but \(holder.type.rawValue) \"\(holder.id)\" has \(labels) label(s)", id: item.id)
      }
      if holder.type == .table, item.type == .tableRow,
        let columns = listCount(holder, "columns"), let cells = listCount(item, "cells"), cells != columns
      {
        return Issue(code: .tableMismatch, message: "TableRow \"\(item.id)\" has \(cells) cell(s), but Table \"\(holder.id)\" has \(columns) column(s)", id: item.id)
      }
      return nil
    }
    for child in n.children {
      if let c = lookup(child), let issue = sizeIssue(n, c) { issues.append(issue) }
    }
    if let pn = parentNode, pn.id != n.id, pn.children.contains(n.id), let issue = sizeIssue(pn, n) { issues.append(issue) }

    return issues
  }
}
