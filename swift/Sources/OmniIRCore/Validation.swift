// Line-level validation: one raw statement on its own, against the catalog in
// Schema.generated.swift. Cross-line rules live in DocumentRules.swift.
// Port of validateStatement in packages/core/src/schema.ts.

/// A statement that passed validation: the only shapes the document sees.
enum Statement {
  case node(OmniNode)
  case mutation(Mutation)
  case state(key: String, value: Primitive)

  /// The id or `$key` this statement defines.
  var definedId: String {
    switch self {
    case .node(let n): n.id
    case .mutation(let m): m.id
    case .state(let key, _): key
    }
  }
}

struct ValidationContext {
  let tools: ToolRegistry
  let assets: Set<String>
  var components: AppComponents = .none
  var pictures: [PicturePattern] = []

  /// A picture name the app knows: registered, or matching one of its patterns (Step 20).
  func knows(picture name: String) -> Bool { assets.contains(name) || matchesPicturePattern(name, pictures) }
}

enum StatementResult {
  case ok(Statement)
  case failed(Issue)
}

/// A converted argument value: what a prop's spec is checked against.
private indirect enum Value {
  case text(String)
  case number(Double)
  case bool(Bool)
  case null
  case ref(String)
  case state(String)
  case array([Value])
  case object([(String, Value)])
}

private enum ArgumentError: Error {
  /// A component call nested inside another statement (flat syntax).
  case notFlat(String)
  case invalid(String)
}

private func toValue(_ raw: RawValue) throws -> Value {
  switch raw {
  case .string(let s): return .text(s)
  case .number(let n): return .number(n)
  case .boolean(let b): return .bool(b)
  case .null: return .null
  case .ident(let name): return .ref(name)
  case .state(let key): return .state(key)
  case .array(let items): return .array(try items.map(toValue))
  case .object(let entries):
    var seen = Set<String>()
    var out: [(String, Value)] = []
    for (key, item) in entries {
      if Catalog.reservedWords.contains(key) { throw ArgumentError.invalid("\"\(key)\" is a reserved key") }
      if !seen.insert(key).inserted { throw ArgumentError.invalid("duplicate key \"\(key)\"") }
      out.append((key, try toValue(item)))
    }
    return .object(out)
  case .call(let callee):
    throw ArgumentError.notFlat("nested component call \(callee)(…) is not allowed; put it on its own line and reference it by id")
  }
}

/// Map positional and named arguments onto one set of props, in order.
private func collectProps(callee: String, args: [RawValue], named: [(String, RawValue)], positional: [String]) throws -> [(String, Value)] {
  if args.count > positional.count {
    throw ArgumentError.invalid("\(callee) takes \(positional.count) positional argument(s) but got \(args.count)")
  }
  var props: [(String, Value)] = []
  var names = Set<String>()
  for (i, arg) in args.enumerated() {
    names.insert(positional[i])
    props.append((positional[i], try toValue(arg)))
  }
  for (name, arg) in named {
    if !names.insert(name).inserted { throw ArgumentError.invalid("argument \"\(name)\" given more than once") }
    props.append((name, try toValue(arg)))
  }
  return props
}

func validateStatement(_ raw: RawStatement, _ ctx: ValidationContext) -> StatementResult {
  switch raw {
  case .state(let key, let rawValue):
    guard key.utf16.count <= Limits.stateKeyLength else {
      return .failed(Issue(code: .invalidProps, message: "state key is too long", id: key))
    }
    let value: Value
    do { value = try toValue(rawValue) } catch { return fail(error, id: key) }
    guard let primitive = primitive(value) else {
      return .failed(Issue(code: .invalidProps, message: "state values must be a string, number, boolean or null", id: key))
    }
    return .ok(.state(key: key, value: primitive))

  case .call(let id, let callee, let args, let named):
    guard isIdentifier(id) else {
      return .failed(Issue(code: .invalidProps, message: "\"\(id)\" is not a valid id (too long or a reserved word)", id: id))
    }
    if callee == "McpMutation" { return validateMutation(id: id, args: args, named: named, ctx) }
    guard let type = ComponentType(rawValue: callee), let spec = Catalog.components[type] else {
      if let app = ctx.components[callee] { return validateAppComponent(id: id, args: args, named: named, app, ctx) }
      return .failed(Issue(code: .unknownComponent, message: "\"\(callee)\" is not in the Trusted Catalog", id: id))
    }
    let props: [(String, Value)]
    do { props = try collectProps(callee: callee, args: args, named: named, positional: spec.positional) } catch { return fail(error, id: id) }
    if let problem = check(props, against: spec) {
      return .failed(Issue(code: .invalidProps, message: problem, id: id))
    }
    if let problem = crossPropRule(type, props) {
      return .failed(Issue(code: .invalidProps, message: problem, id: id))
    }

    var out: [String: PropValue] = [:]
    var children: [String] = []
    for (name, value) in props {
      if case .array(let items) = value, name == "children" {
        children = items.compactMap { if case .ref(let child) = $0 { child } else { nil } }
      } else {
        out[name] = propValue(value)
      }
    }

    // Images come only from the app's asset registry (never a URL).
    let assetProp = type == .image ? "asset" : type == .listItem ? "image" : nil
    if let assetProp, case .text(let asset)? = out[assetProp], !ctx.knows(picture: asset) {
      return .failed(Issue(code: .unknownAsset, message: "image \"\(asset)\" is not in the app's asset registry", id: id))
    }
    return .ok(.node(OmniNode(id: id, type: type, props: out, children: children)))
  }
}

/// One of the app's own components (Step 20): checked like the catalog's, pictures included.
private func validateAppComponent(id: String, args: [RawValue], named: [(String, RawValue)], _ app: AppComponent, _ ctx: ValidationContext) -> StatementResult {
  let props: [(String, Value)]
  do { props = try collectProps(callee: app.name, args: args, named: named, positional: app.spec.positional) } catch { return fail(error, id: id) }
  if let problem = check(props, against: app.spec) {
    return .failed(Issue(code: .invalidProps, message: problem, id: id))
  }
  var out: [String: PropValue] = [:]
  var children: [String] = []
  for (name, value) in props {
    if case .array(let items) = value, name == "children" {
      children = items.compactMap { if case .ref(let child) = $0 { child } else { nil } }
    } else {
      out[name] = propValue(value)
    }
  }
  for (name, prop) in app.declaration.props {
    if case .picture = prop, case .text(let picture)? = out[name], !ctx.knows(picture: picture) {
      return .failed(Issue(code: .unknownAsset, message: "picture \"\(picture)\" is not one the app knows", id: id))
    }
  }
  return .ok(.node(OmniNode(id: id, type: .app, props: out, children: children, appName: app.name, holds: app.holds, isField: app.field)))
}

private func validateMutation(id: String, args: [RawValue], named: [(String, RawValue)], _ ctx: ValidationContext) -> StatementResult {
  let spec = Catalog.mcpMutation
  let props: [(String, Value)]
  do { props = try collectProps(callee: "McpMutation", args: args, named: named, positional: spec.positional) } catch { return fail(error, id: id) }
  if let problem = check(props, against: spec) {
    return .failed(Issue(code: .invalidProps, message: problem, id: id))
  }
  var target = ""
  var tool = ""
  var params: [String: PropValue] = [:]
  for (name, value) in props {
    switch (name, value) {
    case ("target", .ref(let t)): target = t
    case ("tool", .text(let t)): tool = t
    case ("params", .object(let entries)): for (k, v) in entries { params[k] = propValue(v) }
    default: break
    }
  }
  guard ctx.tools[tool] != nil else {
    return .failed(Issue(code: .unknownTool, message: "tool \"\(tool)\" is not in the client tool registry", id: id))
  }
  return .ok(.mutation(Mutation(id: id, target: target, tool: tool, params: params)))
}

private func fail(_ error: Error, id: String) -> StatementResult {
  switch error {
  case ArgumentError.notFlat(let message): .failed(Issue(code: .notFlat, message: message, id: id))
  case ArgumentError.invalid(let message): .failed(Issue(code: .invalidProps, message: message, id: id))
  default: .failed(Issue(code: .invalidProps, message: "\(error)", id: id))
  }
}

// MARK: - Checking values against the catalog

/// The first problem with these props, or nil when they match the component's spec.
private func check(_ props: [(String, Value)], against spec: ComponentSpec) -> String? {
  let given = Dictionary(props, uniquingKeysWith: { first, _ in first })
  for (name, _) in props where !spec.props.contains(where: { $0.name == name }) {
    return "unknown prop \"\(name)\""
  }
  for prop in spec.props {
    guard let value = given[prop.name] else {
      if prop.required { return "\(prop.name) is required" }
      continue
    }
    if !accepts(prop.value, value) { return "\(prop.name): value not allowed" }
  }
  return nil
}

private func accepts(_ spec: ValueSpec, _ value: Value) -> Bool {
  switch (spec, value) {
  case (.anyOf(let options), _):
    return options.contains { accepts($0, value) }
  case (.text(let minLength, let maxLength, let pattern), .text(let s)):
    let length = s.utf16.count
    if let minLength, length < minLength { return false }
    if let maxLength, length > maxLength { return false }
    if let pattern { return matches(s, pattern: pattern) }
    return true
  case (.number(let minimum, let maximum, let integer), .number(let n)):
    guard n.isFinite else { return false }
    if integer && n.rounded(.towardZero) != n { return false }
    if let minimum, n < minimum { return false }
    if let maximum, n > maximum { return false }
    return true
  case (.boolean, .bool), (.null, .null):
    return true
  case (.oneOf(let allowed), .text(let s)):
    return allowed.contains(s)
  case (.textConstant(let c), .text(let s)):
    return s == c
  case (.numberConstant(let c), .number(let n)):
    return n == c
  case (.state, .state(let key)):
    return key.utf16.count <= Limits.stateKeyLength
  case (.ref, .ref(let id)):
    return isIdentifier(id)
  case (.refList(let maxItems), .array(let items)):
    if let maxItems, items.count > maxItems { return false }
    return items.allSatisfy { if case .ref(let id) = $0 { isIdentifier(id) } else { false } }
  case (.list(let item, let minItems, let maxItems), .array(let items)):
    if let minItems, items.count < minItems { return false }
    if let maxItems, items.count > maxItems { return false }
    return items.allSatisfy { accepts(item, $0) }
  case (.record(let keySpec, let valueSpec), .object(let entries)):
    return entries.allSatisfy { accepts(keySpec, .text($0.0)) && !Catalog.reservedWords.contains($0.0) && accepts(valueSpec, $0.1) }
  default:
    return false
  }
}

/// Rules that span more than one prop (schema.json `crossPropRules`), coded by hand.
private func crossPropRule(_ type: ComponentType, _ props: [(String, Value)]) -> String? {
  if type == .rating {
    let given = Dictionary(props, uniquingKeysWith: { first, _ in first })
    var max = 5.0
    if case .number(let m)? = given["max"] { max = m }
    if case .number(let v)? = given["value"], v > max { return "value must not be more than max (default 5)" }
  }
  if type == .input {
    let given = Dictionary(props, uniquingKeysWith: { first, _ in first })
    if case .number(let min)? = given["minLength"], case .number(let max)? = given["maxLength"], min > max {
      return "minLength must not be more than maxLength"
    }
  }
  return nil
}

/// A valid component id: the identifier pattern (already guaranteed by the tokenizer), the length
/// limit, and not a reserved word.
func isIdentifier(_ id: String) -> Bool {
  id.utf16.count <= Limits.idLength && !Catalog.reservedWords.contains(id)
}

/// Whole-string match with JavaScript semantics: patterns are `^…$`, `\d` is ASCII only, and
/// matching is per Unicode scalar rather than per Swift Character.
private func matches(_ s: String, pattern: String) -> Bool {
  var body = Substring(pattern)
  if body.hasPrefix("^") { body.removeFirst() }
  if body.hasSuffix("$") { body.removeLast() }
  guard let regex = try? Regex(String(body)) else { return false }
  return (try? regex.asciiOnlyDigits().matchingSemantics(.unicodeScalar).wholeMatch(in: s)) != nil
}

private func primitive(_ value: Value) -> Primitive? {
  switch value {
  case .text(let s) where s.utf16.count <= Limits.text: .text(s)
  case .number(let n) where n.isFinite: .number(n)
  case .bool(let b): .bool(b)
  case .null: .null
  default: nil
  }
}

private func propValue(_ value: Value) -> PropValue {
  switch value {
  case .text(let s): .text(s)
  case .number(let n): .number(n)
  case .bool(let b): .bool(b)
  case .null: .null
  case .ref(let id): .ref(id)
  case .state(let key): .state(key)
  case .array(let items): .list(items.map(propValue))  // children are taken out before this
  case .object(let entries): .record(Dictionary(entries.map { ($0.0, propValue($0.1)) }, uniquingKeysWith: { first, _ in first }))
  }
}
