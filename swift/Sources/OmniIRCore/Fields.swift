// Form field checks (SPEC.md section 8, Fields, [8.1]–[8.6]): what a renderer says about a field's
// current value. They mirror packages/core/src/fields.ts and the Kotlin Fields.kt; conformance/fields
// holds the shared cases. Written without regular expressions, so they run on every platform. The
// checks only read the props the stream declared and the person's value: the server still checks
// every action's params against the tool's own schema.

/// A field problem: a message key (the renderer's own words) and the values for its placeholders,
/// such as `{min}`.
public struct FieldProblem: Sendable, Hashable {
  public let message: String
  public let values: [String: String]

  public init(_ message: String, _ values: [String: String] = [:]) {
    self.message = message
    self.values = values
  }
}

/// The components that edit a value the checks apply to.
public let fieldTypes: Set<ComponentType> = [.input, .dateInput, .select, .switch]

/// JavaScript's white space (what `\s` and `trim()` mean there), so every renderer trims alike.
private let jsSpace: Set<Unicode.Scalar> = {
  var set: Set<Unicode.Scalar> = ["\t", "\n", "\u{0B}", "\u{0C}", "\r", " ", "\u{A0}", "\u{1680}", "\u{2028}", "\u{2029}", "\u{202F}", "\u{205F}", "\u{3000}", "\u{FEFF}"]
  for v in UInt32(0x2000)...UInt32(0x200A) { if let s = Unicode.Scalar(v) { set.insert(s) } }
  return set
}()

private func jsTrim(_ text: String) -> [Unicode.Scalar] {
  let scalars = Array(text.unicodeScalars)
  guard let first = scalars.firstIndex(where: { !jsSpace.contains($0) }), let last = scalars.lastIndex(where: { !jsSpace.contains($0) }) else { return [] }
  return Array(scalars[first...last])
}

private func isDigit(_ s: Unicode.Scalar) -> Bool { s >= "0" && s <= "9" }

/// Split on one separator, keeping empty parts, like JavaScript's `split`.
private func split(_ scalars: ArraySlice<Unicode.Scalar>, on separator: Unicode.Scalar) -> [ArraySlice<Unicode.Scalar>] {
  scalars.split(separator: separator, omittingEmptySubsequences: false)
}

/// Text, one `@`, then a host of two or more non-empty parts separated by dots; no white space.
private func isEmail(_ text: [Unicode.Scalar]) -> Bool {
  let parts = split(text[...], on: "@")
  guard parts.count == 2, !parts[0].isEmpty, !parts[0].contains(where: jsSpace.contains) else { return false }
  let host = split(parts[1], on: ".")
  return host.count >= 2 && host.allSatisfy { !$0.isEmpty && !$0.contains(where: jsSpace.contains) }
}

/// An optional sign, digits, and an optional decimal part after one "." or ",".
private func isNumber(_ text: [Unicode.Scalar]) -> Bool {
  var rest = text[...]
  if let first = rest.first, first == "+" || first == "-" { rest = rest.dropFirst() }
  let whole = rest.prefix(while: isDigit)
  guard !whole.isEmpty else { return false }
  rest = rest.dropFirst(whole.count)
  guard let mark = rest.first else { return true }
  guard mark == "." || mark == "," else { return false }
  let fraction = rest.dropFirst()
  return !fraction.isEmpty && fraction.allSatisfy(isDigit)
}

/// Digits, spaces, brackets, dashes and dots, with an optional leading "+", and 7 to 15 digits.
private func isPhone(_ text: [Unicode.Scalar]) -> Bool {
  var rest = text[...]
  if rest.first == "+" { rest = rest.dropFirst() }
  let allowed: Set<Unicode.Scalar> = [" ", "(", ")", ".", "-"]
  guard !rest.isEmpty, rest.allSatisfy({ isDigit($0) || allowed.contains($0) }) else { return false }
  let digits = rest.filter(isDigit).count
  return digits >= 7 && digits <= 15
}

/// `http://` or `https://` in any case, a host of two or more parts separated by dots, then
/// optionally "/", "?" or "#" and more; no white space anywhere.
private func isURL(_ text: [Unicode.Scalar]) -> Bool {
  let lower = String(String.UnicodeScalarView(text)).lowercased()
  let scheme = lower.hasPrefix("https://") ? 8 : lower.hasPrefix("http://") ? 7 : 0
  guard scheme > 0 else { return false }
  let rest = text.dropFirst(scheme)
  guard !rest.contains(where: jsSpace.contains) else { return false }
  let host = rest.prefix { $0 != "/" && $0 != "?" && $0 != "#" }
  let parts = split(host, on: ".")
  return parts.count >= 2 && parts.allSatisfy { !$0.isEmpty }
}

/// A whole number as JavaScript writes it, so `{min}` reads "3", not "3.0".
private func jsNumber(_ n: Double) -> String {
  n == n.rounded() && abs(n) < 1e15 ? String(Int(n)) : String(n)
}

/// Text compared by UTF-16 code units, like JavaScript's `<`.
private func before(_ a: String, _ b: String) -> Bool { a.utf16.lexicographicallyPrecedes(b.utf16) }

/// The first problem with a field's value, or nil when it passes ([8.2]–[8.4]). `props` are the
/// field's props as the stream declared them; `value` is its state's current value. Components that
/// aren't fields always pass.
public func checkField(_ type: ComponentType, props: [String: PropValue], value: Primitive?) -> FieldProblem? {
  let required = props["required"] == .bool(true)
  switch type {
  case .switch:
    return required && value != .bool(true) ? FieldProblem("turnOn") : nil
  case .select:
    guard required else { return nil }
    if case .text(let chosen)? = value, case .list(let options)? = props["options"], options.contains(.text(chosen)) { return nil }
    return FieldProblem("chooseOption")
  case .dateInput:
    var date = ""
    if case .text(let text)? = value { date = String(String.UnicodeScalarView(jsTrim(text))) }
    if date.isEmpty { return required ? FieldProblem("required") : nil }
    if case .text(let min)? = props["min"], before(date, min) { return FieldProblem("dateTooEarly", ["min": min]) }
    if case .text(let max)? = props["max"], before(max, date) { return FieldProblem("dateTooLate", ["max": max]) }
    return nil
  case .input:
    var text: [Unicode.Scalar] = []
    if case .text(let raw)? = value { text = jsTrim(raw) }
    if text.isEmpty { return required ? FieldProblem("required") : nil }
    if case .text(let format)? = props["format"] {
      switch format {
      case "email" where !isEmail(text): return FieldProblem("invalidEmail")
      case "number" where !isNumber(text): return FieldProblem("invalidNumber")
      case "phone" where !isPhone(text): return FieldProblem("invalidPhone")
      case "url" where !isURL(text): return FieldProblem("invalidUrl")
      default: break
      }
    }
    // Unicode code points, as people count characters.
    if case .number(let min)? = props["minLength"], Double(text.count) < min { return FieldProblem("tooShort", ["min": jsNumber(min)]) }
    if case .number(let max)? = props["maxLength"], Double(text.count) > max { return FieldProblem("tooLong", ["max": jsNumber(max)]) }
    return nil
  default:
    return nil
  }
}

/// The `$key` a field edits, or nil for a component that isn't a field.
public func fieldKey(_ node: OmniNode) -> String? {
  guard fieldTypes.contains(node.type), case .state(let key)? = node.props["value"] else { return nil }
  return key
}

/// The fields a governed Button's press checks ([8.6]): those whose `$key` its McpMutation's params
/// read, in the order their lines arrived.
public func fieldsReadBy(_ mutation: Mutation, in document: OmniDocument) -> [String] {
  var keys: Set<String> = []
  for case .state(let key) in mutation.params.values { keys.insert(key) }
  guard !keys.isEmpty else { return [] }
  return document.order.filter { id in document.nodes[id].flatMap(fieldKey).map(keys.contains) ?? false }
}
