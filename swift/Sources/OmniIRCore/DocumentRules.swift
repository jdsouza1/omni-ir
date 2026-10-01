// Cross-line rules for a list of individually validated statements, in stream order.
// Port of validateDocument in packages/core/src/schema.ts.

/// `complete: false` while streaming checks only rules a later line can never fix; `true` at the end of
/// the stream also checks dangling references, the root and governance.
func validateDocument(_ statements: [Statement], complete: Bool) -> [Issue] {
  var issues: [Issue] = []
  var byId: [String: Statement] = [:]
  var order: [String] = []
  var state: [String: Primitive] = [:]

  for s in statements {
    switch s {
    case .state(let key, let value):
      if state[key] != nil { issues.append(Issue(code: .duplicateId, message: "\(key) is assigned more than once", id: key)) }
      else { state[key] = value }
    case .node, .mutation:
      let id = s.definedId
      if byId[id] != nil { issues.append(Issue(code: .duplicateId, message: "\"\(id)\" is assigned more than once", id: id)) }
      else {
        byId[id] = s
        order.append(id)
      }
    }
  }

  let nodes: [OmniNode] = order.compactMap { if case .node(let n)? = byId[$0] { n } else { nil } }
  let mutations: [Mutation] = order.compactMap { if case .mutation(let m)? = byId[$0] { m } else { nil } }
  func node(_ id: String) -> OmniNode? { if case .node(let n)? = byId[id] { n } else { nil } }
  func isMutation(_ id: String) -> Bool { if case .mutation? = byId[id] { true } else { false } }

  // Tree shape: one parent per node, no repeats in a children list, root is never a child.
  var parentOf: [String: String] = [:]
  for n in nodes {
    var seen = Set<String>()
    for child in n.children {
      if !seen.insert(child).inserted {
        issues.append(Issue(code: .duplicateChild, message: "\"\(child)\" appears twice in \(n.id)'s children", id: n.id))
        continue
      }
      if child == Catalog.rootId {
        issues.append(Issue(code: .rootAsChild, message: "\"\(Catalog.rootId)\" cannot be a child", id: n.id))
        continue
      }
      if isMutation(child) {
        issues.append(Issue(code: .childNotComponent, message: "\"\(child)\" is an McpMutation, not a component", id: n.id))
        continue
      }
      if let existing = parentOf[child] {
        issues.append(Issue(code: .multipleParents, message: "\"\(child)\" already belongs to \"\(existing)\" and cannot also be a child of \"\(n.id)\"", id: n.id))
        continue
      }
      parentOf[child] = n.id
    }
  }

  // Cycles: follow parent links upward; returning to the start means a cycle.
  var reported = Set<String>()
  for n in nodes {
    var path: Set<String> = [n.id]
    var current = parentOf[n.id]
    while let c = current, !path.contains(c) {
      path.insert(c)
      current = parentOf[c]
    }
    if current == n.id && !reported.contains(n.id) {
      reported.formUnion(path)
      issues.append(Issue(code: .cycle, message: "\"\(n.id)\" contains itself through its children", id: n.id))
    }
  }

  // Inputs edit text, so their state must hold a string; DateInputs need a YYYY-MM-DD date or "".
  for n in nodes where n.type == .input || n.type == .dateInput {
    guard case .state(let key)? = n.props["value"], let value = state[key] else { continue }
    if n.type == .input, case .text = value { continue }
    if n.type == .dateInput, case .text(let s) = value, s.isEmpty || isISODate(s) { continue }
    let message = n.type == .input
      ? "Input \"\(n.id)\" is bound to \(key), which is not a string"
      : "DateInput \"\(n.id)\" is bound to \(key), which is not a YYYY-MM-DD date or \"\""
    issues.append(Issue(code: .inputStateType, message: message, id: n.id))
  }

  // A List holds only ListItems, and a ListItem only sits in a List.
  for n in nodes {
    if n.type == .list {
      for child in n.children {
        if let c = node(child), c.type != .listItem {
          issues.append(Issue(code: .listMismatch, message: "List \"\(n.id)\" can only contain ListItems, not \(c.type.rawValue) \"\(child)\"", id: n.id))
        }
      }
    }
    if n.type == .listItem, let parent = parentOf[n.id], let p = node(parent), p.type != .list {
      issues.append(Issue(code: .listMismatch, message: "ListItem \"\(n.id)\" must be inside a List, not \(p.type.rawValue) \"\(parent)\"", id: n.id))
    }
  }

  var governed: [String: String] = [:]
  for m in mutations {
    if let existing = governed[m.target] {
      issues.append(Issue(code: .duplicateMutation, message: "\"\(m.target)\" is already governed by \"\(existing)\"", id: m.id))
    } else {
      governed[m.target] = m.id
    }
  }

  guard complete else { return issues }

  switch byId[Catalog.rootId] {
  case nil: issues.append(Issue(code: .missingRoot, message: "no \"\(Catalog.rootId) = …\" line was received"))
  case .mutation?: issues.append(Issue(code: .rootNotComponent, message: "\"\(Catalog.rootId)\" must be a component, not an McpMutation", id: Catalog.rootId))
  default: break
  }

  for n in nodes {
    for child in n.children where byId[child] == nil {
      // Reported against the node holding the reference: it has a line, the missing id never did.
      issues.append(Issue(code: .danglingRef, message: "\"\(n.id)\" references \"\(child)\", which never arrived", id: n.id))
    }
  }

  for (id, keys) in nodes.map({ ($0.id, stateKeys($0.props)) }) + mutations.map({ ($0.id, stateKeys($0.params)) }) {
    for key in keys where state[key] == nil {
      issues.append(Issue(code: .missingState, message: "\"\(id)\" uses \(key), which was never declared", id: id))
    }
  }

  for m in mutations {
    if byId[m.target] == nil {
      issues.append(Issue(code: .danglingRef, message: "\"\(m.id)\" targets \"\(m.target)\", which never arrived", id: m.id))
    } else if !(node(m.target).map(isMutating) ?? false) {
      issues.append(Issue(code: .mutationTargetNotInteractive, message: "\"\(m.id)\" targets \"\(m.target)\", which has no action to govern", id: m.id))
    }
  }

  for n in nodes where isMutating(n) && governed[n.id] == nil {
    issues.append(Issue(code: .ungovernedMutation, message: "\"\(n.id)\" has an action but is not wrapped by an McpMutation", id: n.id))
  }

  return issues
}

/// True when a component triggers a backend action, so it must be governed by an McpMutation.
public func isMutating(_ node: OmniNode) -> Bool {
  node.type == .button && node.props["action"] != nil
}

/// Every `$key` a set of props or params reads, in a stable order.
func stateKeys(_ values: [String: PropValue]) -> [String] {
  values.keys.sorted().compactMap { if case .state(let key)? = values[$0] { key } else { nil } }
}

/// `^\d{4}-\d{2}-\d{2}$` with ASCII digits.
func isISODate(_ s: String) -> Bool {
  let u = Array(s.utf8)
  guard u.count == 10, u[4] == UInt8(ascii: "-"), u[7] == UInt8(ascii: "-") else { return false }
  return [0, 1, 2, 3, 5, 6, 8, 9].allSatisfy { (UInt8(ascii: "0")...UInt8(ascii: "9")).contains(u[$0]) }
}
