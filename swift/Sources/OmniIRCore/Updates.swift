// Updates (SPEC.md [10.29]-[10.34]): Omni-IR text from the app's own code that changes a screen after
// its stream has ended. Port of packages/core/src/updates.ts: the same lines as a stream, where an id
// or $key the screen has is replaced; checked on its own lines, then as the whole screen it would
// leave, and applied whole or not at all.

/// At most this many lines in one update, blank and comment lines included ([10.30]).
public let maxUpdateLines = 2000

/// Whether an update changed the screen (a rejected one changes nothing), with its issues; lines count from 1 in the update.
public struct UpdateResult: Sendable, Equatable {
  public var applied: Bool
  public var issues: [Issue]
}

/// The last update applied: how many so far, and the ids and `$keys` it assigned (for announcing changed Notices, [8.8]).
public struct LastUpdate: Sendable, Equatable {
  public var count: Int
  public var assigned: [String]
}

enum UpdatePlan {
  case rejected([Issue])
  /// The screen's statements after the update, what it assigned and kept, and its document errors (the next baseline).
  case applied(issues: [Issue], statements: [Statement], assigned: [Statement], documentIssues: [Issue])
}

private func issueKey(_ i: Issue) -> String { "\(i.code.rawValue)\u{0}\(i.id ?? "")" }

private func readKey(_ n: OmniNode) -> String? {
  guard [.input, .dateInput, .select, .switch].contains(n.type) else { return appBoundKey(n) }
  if case .state(let key)? = n.props["value"] { return key }
  return nil
}

func planUpdate(
  current: [Statement], baseline: [Issue], text: String, context: ValidationContext, maxLineLength: Int
) -> UpdatePlan {
  var buffer = LineBuffer(maxLineLength: maxLineLength)
  let events = buffer.push(text) + buffer.end()
  if events.count > maxUpdateLines {
    return .rejected([Issue(code: .updateTooLarge, message: "an update may hold at most \(maxUpdateLines) lines (this one has \(events.count))")])
  }

  // Each line on its own: grammar, catalog, props, tools, pictures ([10.32]); each id once ([10.30]).
  var issues: [Issue] = []
  var assigned: [Statement] = []
  var lineOf: [String: Int] = [:]
  for event in events {
    switch event {
    case .overflow(let line, let length):
      issues.append(Issue(code: .lineTooLong, message: "line is longer than the limit (\(length) characters seen)", line: line))
    case .line(let text, let line):
      switch parseLine(text) {
      case .empty:
        continue
      case .error(var issue):
        issue.line = line
        issues.append(issue)
      case .statement(let raw, let warnings):
        for var warning in warnings {
          warning.line = line
          issues.append(warning)
        }
        switch validateStatement(raw, context) {
        case .failed(var issue):
          issue.line = line
          issues.append(issue)
        case .ok(let statement):
          let key = statement.definedId
          if lineOf[key] != nil {
            issues.append(Issue(code: .duplicateId, message: "\(key) is assigned more than once in this update", id: key, line: line))
          } else {
            lineOf[key] = line
            assigned.append(statement)
          }
        }
      }
    }
  }
  func failed() -> Bool { issues.contains { $0.code.severity == .error } }
  if failed() { return .rejected(issues) }

  // The screen it would leave: replaced lines keep their place, new ones follow in order ([10.32]).
  var order: [String] = []
  var byKey: [String: Statement] = [:]
  for s in current + assigned {
    if byKey.updateValue(s, forKey: s.definedId) == nil { order.append(s.definedId) }
  }

  // What the person enters belongs to them: no $key a field reads, before or after ([10.34]).
  var readByField = Set<String>()
  for s in current + Array(byKey.values) {
    if case .node(let n) = s, let key = readKey(n) { readByField.insert(key) }
  }
  var existing = Set<String>()
  for s in current { if case .state(let key, _) = s { existing.insert(key) } }
  for s in assigned {
    if case .state(let key, _) = s, existing.contains(key), readByField.contains(key) {
      issues.append(Issue(code: .liveFieldConflict, message: "\(key) is read by a field, so an update can't change it", id: key, line: lineOf[key]))
    }
  }
  if failed() { return .rejected(issues) }

  // Keep only what root reaches, and McpMutations whose targets stay Buttons with an action ([10.31]).
  var reachable = Set<String>()
  var stack = [Catalog.rootId]
  while let id = stack.popLast() {
    guard !reachable.contains(id), case .node(let n)? = byKey[id] else { continue }
    reachable.insert(id)
    stack.append(contentsOf: n.children.reversed())
  }
  func governs(_ target: String) -> Bool {
    guard reachable.contains(target), case .node(let t)? = byKey[target] else { return false }
    return isMutating(t)
  }
  let statements: [Statement] = order.compactMap { key in
    guard let s = byKey[key] else { return nil }
    switch s {
    case .state: return s
    case .node(let n): return reachable.contains(n.id) ? s : nil
    case .mutation(let m): return governs(m.target) ? s : nil
    }
  }
  let kept = Set(statements.map(\.definedId))

  // The whole screen, as at end of stream; only errors it didn't have stop the update ([10.33]).
  let documentIssues = validateDocument(statements, complete: true)
  let before = Set(baseline.map(issueKey))
  for var issue in documentIssues where !before.contains(issueKey(issue)) {
    if let id = issue.id, let line = lineOf[id] { issue.line = line }
    issues.append(issue)
  }
  if failed() { return .rejected(issues) }
  return .applied(issues: issues, statements: statements, assigned: assigned.filter { kept.contains($0.definedId) }, documentIssues: documentIssues)
}

/// The references a screen's components and McpMutations make that nothing defines (its `missing`).
func missingReferences(_ statements: [Statement]) -> Set<String> {
  var ids = Set<String>()
  var keys = Set<String>()
  for s in statements {
    if case .state(let key, _) = s { keys.insert(key) } else { ids.insert(s.definedId) }
  }
  var missing = Set<String>()
  for s in statements {
    switch s {
    case .state: break
    case .node(let n):
      for child in n.children where !ids.contains(child) { missing.insert(child) }
      for key in stateKeys(n.props) where !keys.contains(key) { missing.insert(key) }
    case .mutation(let m):
      for key in stateKeys(m.params) where !keys.contains(key) { missing.insert(key) }
    }
  }
  return missing
}
