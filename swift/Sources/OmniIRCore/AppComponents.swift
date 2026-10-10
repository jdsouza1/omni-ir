// App-defined components (Step 20, PLAN-APPCOMPONENTS.md, SPEC.md [5.27]–[5.30]): an app declares
// its own components with the same kinds of value the Trusted Catalog uses, and lines that use one
// are checked like a built-in component. Port of packages/core/src/appComponents.ts and the Kotlin
// AppComponents.kt: the same plain-JSON declarations, compiled to the catalog's own spec, so the
// three parsers agree. An app component can show values, edit one $state and hold children; it can
// never run an action, carry styling or code, or load a URL.
import Foundation

/// A declaration problem: found when the app starts, never while a stream is read.
public struct AppComponentError: Error, CustomStringConvertible, Sendable {
  public let description: String
  init(_ description: String) { self.description = description }
}

/// What kind of value an edited `$state` holds.
public enum StateHolds: String, Sendable, Hashable {
  case text, number, boolean
}

/// One prop of an app component, as in the plain-JSON declaration.
public enum AppProp: Sendable, Hashable {
  /// Text, or a `$state` whose current value is shown (unless `state` is false).
  case text(minLength: Int? = nil, maxLength: Int? = nil, state: Bool = true, optional: Bool = false)
  /// A number, or a `$state` whose current value is shown (unless `state` is false).
  case number(minimum: Double? = nil, maximum: Double? = nil, integer: Bool = false, state: Bool = true, optional: Bool = false)
  case boolean(optional: Bool = false)
  /// One of the listed text values.
  case oneOf([String], optional: Bool = false)
  /// The `$state` the component edits; the prop must be called `value`.
  case state(StateHolds, optional: Bool = false)
  /// A picture name: registered with the app, or matching one of its picture patterns. Never a URL.
  case picture(optional: Bool = false)
  /// A list of plain text (`numbers` false) or numbers.
  case list(numbers: Bool = false, maxItems: Int? = nil, optional: Bool = false)

  var optional: Bool {
    switch self {
    case .text(_, _, _, let o), .number(_, _, _, _, let o), .boolean(let o), .oneOf(_, let o), .state(_, let o), .picture(let o), .list(_, _, let o): o
    }
  }
}

public struct AppComponentDeclaration: Sendable, Hashable {
  /// What it is, in one sentence, for the model (and for people reviewing streams).
  public var description: String
  /// Props in declaration order.
  public var props: [(String, AppProp)]
  /// Props that may be written without their names, in order; `children` may be among them.
  public var positional: [String]
  /// Present when it holds other components: at most this many.
  public var childrenMax: Int?
  /// It edits a `$state` (its `value` prop) the person fills in, and accepts `required` ([8.2]).
  public var field: Bool

  public init(description: String, props: [(String, AppProp)], positional: [String] = [], childrenMax: Int? = nil, field: Bool = false) {
    self.description = description
    self.props = props
    self.positional = positional
    self.childrenMax = childrenMax
    self.field = field
  }

  public static func == (a: Self, b: Self) -> Bool {
    a.description == b.description && a.positional == b.positional && a.childrenMax == b.childrenMax && a.field == b.field
      && a.props.map(\.0) == b.props.map(\.0) && a.props.map(\.1) == b.props.map(\.1)
  }

  public func hash(into h: inout Hasher) {
    h.combine(description)
    for (name, prop) in props { h.combine(name); h.combine(prop) }
  }
}

/// A declared component, ready for the parser.
public struct AppComponent: Sendable {
  public let name: String
  public let declaration: AppComponentDeclaration
  let spec: ComponentSpec
  /// What the `$state` it edits holds, when it edits one.
  public let holds: StateHolds?
  public var field: Bool { declaration.field }
}

/// The app's components, by name.
public struct AppComponents: Sendable {
  private let byName: [String: AppComponent]
  /// The names, in declaration order.
  public let names: [String]

  public static let none = AppComponents(byName: [:], names: [])

  private init(byName: [String: AppComponent], names: [String]) {
    self.byName = byName
    self.names = names
  }

  /// Declare the app's components; throws an AppComponentError for any problem.
  public init(_ declarations: [(String, AppComponentDeclaration)]) throws {
    var byName: [String: AppComponent] = [:]
    for (name, d) in declarations { byName[name] = try compile(name, d) }
    self.init(byName: byName, names: declarations.map(\.0))
  }

  public subscript(name: String) -> AppComponent? { byName[name] }
}

public enum AppLimits {
  public static let props = 24
  public static let description = 300
  public static let listItems = 50
}

private func refuse(_ name: String, _ why: String) -> AppComponentError {
  AppComponentError("app component \"\(name)\": \(why)")
}

private func isName(_ s: String) -> Bool {
  guard let first = s.unicodeScalars.first, first.isASCII, ("A"..."Z").contains(first), s.unicodeScalars.count <= 64 else { return false }
  return s.unicodeScalars.allSatisfy { $0.isASCII && ($0.properties.isAlphabetic || ("0"..."9").contains($0)) }
}

private func isPropName(_ s: String) -> Bool {
  guard let first = s.unicodeScalars.first, first.isASCII, ("a"..."z").contains(first), s.unicodeScalars.count <= 64 else { return false }
  return s.unicodeScalars.allSatisfy { $0.isASCII && ($0.properties.isAlphabetic || ("0"..."9").contains($0)) }
}

private let maxSafe = 9007199254740991.0

private func valueSpec(_ component: String, _ prop: String, _ p: AppProp) throws -> ValueSpec {
  func bad(_ why: String) -> AppComponentError { refuse(component, "prop \"\(prop)\" \(why)") }
  switch p {
  case .text(let minLength, let maxLength, let state, _):
    if let minLength, minLength < 0 { throw bad("needs whole-number lengths up to \(Limits.text)") }
    if let maxLength, maxLength < 1 || maxLength > Limits.text { throw bad("needs whole-number lengths up to \(Limits.text)") }
    if let minLength, let maxLength, minLength > maxLength { throw bad("has minLength above maxLength") }
    let text = ValueSpec.text(minLength: minLength, maxLength: maxLength ?? Limits.text, pattern: nil)
    return state ? .anyOf([text, .state]) : text
  case .number(let minimum, let maximum, let integer, let state, _):
    if minimum.map({ !$0.isFinite }) == true || maximum.map({ !$0.isFinite }) == true { throw bad("needs finite limits") }
    if let minimum, let maximum, minimum > maximum { throw bad("has a minimum above its maximum") }
    // A whole number is also within ±(2^53 - 1), as JSON Schema's integers and the TypeScript parser have it.
    let low = integer ? max(minimum ?? -maxSafe, -maxSafe) : minimum
    let high = integer ? min(maximum ?? maxSafe, maxSafe) : maximum
    let number = ValueSpec.number(minimum: low, maximum: high, integer: integer)
    return state ? .anyOf([number, .state]) : number
  case .boolean:
    return .boolean
  case .oneOf(let values, _):
    if values.isEmpty || values.count > AppLimits.listItems || values.contains(where: { $0.isEmpty || $0.utf16.count > 200 }) { throw bad("needs 1 to 50 text choices") }
    return .oneOf(values)
  case .state:
    if prop != "value" { throw bad("edits a $state, so it must be called \"value\"") }
    return .state
  case .picture:
    return .text(minLength: nil, maxLength: 64, pattern: "^[a-z0-9][a-z0-9-]*$")
  case .list(let numbers, let maxItems, _):
    let limit = maxItems ?? AppLimits.listItems
    if limit < 1 || limit > AppLimits.listItems { throw bad("needs maxItems from 1 to \(AppLimits.listItems)") }
    let item: ValueSpec = numbers ? .number(minimum: nil, maximum: nil, integer: false) : .text(minLength: nil, maxLength: Limits.text, pattern: nil)
    return .list(item: item, minItems: nil, maxItems: limit)
  }
}

private func compile(_ name: String, _ d: AppComponentDeclaration) throws -> AppComponent {
  guard isName(name) else { throw refuse(name, "names start with a capital letter and use only letters and digits") }
  if Catalog.components[ComponentType(rawValue: name) ?? .app] != nil || name == "McpMutation" || name == "App" {
    throw refuse(name, "this name is taken by the Trusted Catalog")
  }
  if d.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || d.description.utf16.count > AppLimits.description {
    throw refuse(name, "needs a description of 1 to \(AppLimits.description) characters")
  }
  if d.props.count > AppLimits.props { throw refuse(name, "has more than \(AppLimits.props) props") }
  let reserved: Set<String> = Set(["children", "action", "required", "kind"]).union(Catalog.reservedWords)
  var specs: [PropSpec] = []
  var holds: StateHolds?
  var seen: Set<String> = []
  for (prop, p) in d.props {
    guard isPropName(prop), !reserved.contains(prop), seen.insert(prop).inserted else { throw refuse(name, "\"\(prop)\" can't be a prop name") }
    specs.append(PropSpec(name: prop, required: !p.optional, value: try valueSpec(name, prop, p)))
    if case .state(let h, _) = p { holds = h }
  }
  if d.field {
    guard holds != nil else { throw refuse(name, "a field edits a $state: give it a \"value\" prop made with state()") }
    specs.append(PropSpec(name: "required", required: false, value: .boolean))
  }
  if let max = d.childrenMax {
    guard max >= 1, max <= Limits.children else { throw refuse(name, "children.max must be from 1 to \(Limits.children)") }
    specs.append(PropSpec(name: "children", required: false, value: .refList(maxItems: max)))
  }
  for p in d.positional where p == "required" || !specs.contains(where: { $0.name == p }) {
    throw refuse(name, "positional \"\(p)\" isn't one of its props")
  }
  if Set(d.positional).count != d.positional.count { throw refuse(name, "lists a positional prop twice") }
  return AppComponent(name: name, declaration: d, spec: ComponentSpec(positional: d.positional, props: specs), holds: holds)
}

// MARK: - Pictures looked up when drawn

/// A family of picture names the app looks up when a screen is drawn, such as `product-{id}`.
public struct PicturePattern: Sendable, Hashable {
  /// The fixed start, such as `product-`.
  public let prefix: String
  /// `digits`: 0-9; `letters-digits`: a-z and 0-9.
  public let id: String
  /// Longest id.
  public let maxLength: Int

  /// A family written like `product-{id}`.
  public init(_ pattern: String, id: String, maxLength: Int = 32) throws {
    let fail = AppComponentError("picture pattern \"\(pattern)\": write a lowercase prefix ending in \"-\", then {id}, such as \"product-{id}\"")
    guard pattern.hasSuffix("-{id}") else { throw fail }
    let prefix = String(pattern.dropLast(4))
    guard let first = prefix.unicodeScalars.first, ("a"..."z").contains(first) || ("0"..."9").contains(first),
      prefix.unicodeScalars.allSatisfy({ ("a"..."z").contains($0) || ("0"..."9").contains($0) || $0 == "-" })
    else { throw fail }
    guard id == "digits" || id == "letters-digits" else { throw AppComponentError("picture pattern \"\(pattern)\": id is \"digits\" or \"letters-digits\"") }
    guard maxLength >= 1, prefix.utf16.count + maxLength <= 64 else { throw AppComponentError("picture pattern \"\(pattern)\": names are at most 64 characters") }
    self.prefix = prefix
    self.id = id
    self.maxLength = maxLength
  }
}

/// True when a picture name matches one of the app's patterns.
public func matchesPicturePattern(_ name: String, _ patterns: [PicturePattern]) -> Bool {
  patterns.contains { p in
    guard name.hasPrefix(p.prefix) else { return false }
    let id = name.unicodeScalars.dropFirst(p.prefix.unicodeScalars.count)
    return (1...p.maxLength).contains(id.count)
      && id.allSatisfy { ("0"..."9").contains($0) || (p.id == "letters-digits" && ("a"..."z").contains($0)) }
  }
}

// MARK: - Reading the plain-JSON declarations

/// A JSON number as JSONSerialization hands it over on any platform (NSNumber, Double or Int).
private func jsonNumber(_ value: Any?) -> Double? {
  switch value {
  case let d as Double: d
  case let i as Int: Double(i)
  case let n as NSNumber: n.doubleValue
  default: nil
  }
}

/// The app's components from their plain-JSON declarations (as TypeScript's `componentDeclarations`
/// writes them), already parsed with JSONSerialization. Throws for anything malformed.
public func appComponents(fromJSONObject json: Any) throws -> AppComponents {
  guard let object = json as? [String: Any] else { throw AppComponentError("the app's components must be a JSON object") }
  // JSONSerialization doesn't keep key order; the order only matters for display, so sort by name.
  return try AppComponents(object.keys.sorted().map { name in (name, try declaration(name, object[name])) })
}

/// Picture patterns from plain JSON: a list of `{prefix, id, maxLength}`.
public func picturePatterns(fromJSONObject json: Any) throws -> [PicturePattern] {
  guard let list = json as? [Any] else { throw AppComponentError("picture patterns must be a JSON list") }
  return try list.map { item in
    guard let p = item as? [String: Any], let prefix = p["prefix"] as? String else { throw AppComponentError("a picture pattern needs a prefix") }
    return try PicturePattern(prefix + "{id}", id: p["id"] as? String ?? "", maxLength: jsonNumber(p["maxLength"]).map { Int($0) } ?? 32)
  }
}

/// Components and picture patterns from JSON text `{"components": {…}, "pictures": […]}`.
public func appRegistry(fromJSON data: Data) throws -> (components: AppComponents, pictures: [PicturePattern]) {
  guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
    throw AppComponentError("the app's components must be a JSON object")
  }
  let components = try object["components"].map(appComponents(fromJSONObject:)) ?? .none
  let pictures = try object["pictures"].map(picturePatterns(fromJSONObject:)) ?? []
  return (components, pictures)
}

private func declaration(_ name: String, _ value: Any?) throws -> AppComponentDeclaration {
  guard let d = value as? [String: Any] else { throw refuse(name, "the declaration must be an object") }
  let rawProps = d["props"] as? [String: Any] ?? [:]
  let order = (d["propOrder"] as? [String]) ?? rawProps.keys.sorted()
  let props = try order.compactMap { prop -> (String, AppProp)? in
    guard let p = rawProps[prop] as? [String: Any] else { return nil }
    return (prop, try appProp(name, prop, p))
  }
  return AppComponentDeclaration(
    description: d["description"] as? String ?? "",
    props: props,
    positional: d["positional"] as? [String] ?? [],
    childrenMax: jsonNumber((d["children"] as? [String: Any])?["max"]).map { Int($0) },
    field: (d["field"] as? Bool) == true
  )
}

private func appProp(_ name: String, _ prop: String, _ p: [String: Any]) throws -> AppProp {
  let optional = (p["optional"] as? Bool) == true
  func int(_ key: String) -> Int? { jsonNumber(p[key]).map { Int($0) } }
  func num(_ key: String) -> Double? { jsonNumber(p[key]) }
  let state = (p["state"] as? Bool) != false
  switch p["kind"] as? String {
  case "text": return .text(minLength: int("minLength"), maxLength: int("maxLength"), state: state, optional: optional)
  case "number": return .number(minimum: num("minimum"), maximum: num("maximum"), integer: (p["integer"] as? Bool) == true, state: state, optional: optional)
  case "boolean": return .boolean(optional: optional)
  case "oneOf": return .oneOf(p["values"] as? [String] ?? [], optional: optional)
  case "state":
    guard let holds = (p["holds"] as? String).flatMap(StateHolds.init(rawValue:)) else { throw refuse(name, "prop \"\(prop)\" needs holds") }
    return .state(holds, optional: optional)
  case "picture": return .picture(optional: optional)
  case "list": return .list(numbers: (p["item"] as? String) == "number", maxItems: int("maxItems"), optional: optional)
  default: throw refuse(name, "prop \"\(prop)\" has an unknown kind")
  }
}
