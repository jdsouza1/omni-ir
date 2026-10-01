// R4: the line start (`id =` or `$key =`) is matched first; everything after it goes through a
// character-by-character tokenizer and a small recursive-descent parser, so commas, parentheses,
// `#` and `$` inside strings are just text. The grammar accepts any well-formed value, including
// nested calls; validation decides what is allowed. Port of packages/core/src/tokenizer.ts.

/// A value as written, before validation. Nothing here is trusted.
indirect enum RawValue: Equatable {
  case string(String)
  case number(Double)
  case boolean(Bool)
  case null
  case ident(String)
  case state(String)
  case array([RawValue])
  case object([(String, RawValue)])
  /// A component call used as a value. Always rejected by validation (flat syntax).
  case call(String)

  static func == (a: RawValue, b: RawValue) -> Bool {
    switch (a, b) {
    case let (.string(x), .string(y)), let (.ident(x), .ident(y)), let (.state(x), .state(y)), let (.call(x), .call(y)): x == y
    case let (.number(x), .number(y)): x == y
    case let (.boolean(x), .boolean(y)): x == y
    case (.null, .null): true
    case let (.array(x), .array(y)): x == y
    case let (.object(x), .object(y)): x.count == y.count && zip(x, y).allSatisfy { $0.0 == $1.0 && $0.1 == $1.1 }
    default: false
    }
  }
}

enum RawStatement {
  case state(key: String, value: RawValue)
  case call(id: String, callee: String, args: [RawValue], named: [(String, RawValue)])
}

enum LineResult {
  case empty
  case statement(RawStatement, warnings: [Issue])
  case error(Issue)
}

private struct LineError: Error {
  let code: IssueCode
  let message: String
  let col: Int
}

func parseLine(_ text: String) -> LineResult {
  let s = Array(text.unicodeScalars)
  if isBlankOrComment(s) { return .empty }
  guard let (target, offset) = lineStart(s) else {
    return error(.syntax, #"expected "name = Component(…)" or "$name = value""#, col: 1)
  }
  do {
    var warnings: [Issue] = []
    let tokens = try tokenize(Array(s[offset...]), offset: offset, warnings: &warnings)
    var parser = TokenParser(tokens: tokens)
    let statement = target.hasPrefix("$") ? try parser.stateStatement(target) : try parser.callStatement(target)
    return .statement(statement, warnings: warnings)
  } catch let e as LineError {
    return error(e.code, e.message, col: e.col)
  } catch {
    return .error(Issue(code: .syntax, message: "\(error)"))
  }
}

private func error(_ code: IssueCode, _ message: String, col: Int) -> LineResult {
  .error(Issue(code: code, message: "col \(col): \(message)"))
}

// MARK: - Character classes (as JavaScript regular expressions define them)

/// JavaScript's `\s`: WhiteSpace and LineTerminator.
func isJSWhitespace(_ c: Unicode.Scalar) -> Bool {
  switch c.value {
  case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: true
  default: false
  }
}

/// JavaScript's `.` without the `s` flag: anything but a line terminator.
private func isJSDot(_ c: Unicode.Scalar) -> Bool {
  !(c == "\n" || c == "\r" || c.value == 0x2028 || c.value == 0x2029)
}

private func isIdentStart(_ c: Unicode.Scalar) -> Bool {
  ("A"..."Z").contains(c) || ("a"..."z").contains(c) || c == "_"
}

private func isIdentChar(_ c: Unicode.Scalar) -> Bool {
  isIdentStart(c) || isDigit(c)
}

private func isDigit(_ c: Unicode.Scalar) -> Bool {
  ("0"..."9").contains(c)
}

/// `^\s*(#.*)?$`
private func isBlankOrComment(_ s: [Unicode.Scalar]) -> Bool {
  var i = 0
  while i < s.count && isJSWhitespace(s[i]) { i += 1 }
  if i == s.count { return true }
  guard s[i] == "#" else { return false }
  return s[(i + 1)...].allSatisfy(isJSDot)
}

/// `^\s*(\$?[A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*`: the target and the length of the match.
private func lineStart(_ s: [Unicode.Scalar]) -> (String, Int)? {
  var i = 0
  while i < s.count && isJSWhitespace(s[i]) { i += 1 }
  let nameStart = i
  if i < s.count && s[i] == "$" { i += 1 }
  guard i < s.count && isIdentStart(s[i]) else { return nil }
  while i < s.count && isIdentChar(s[i]) { i += 1 }
  let name = String(String.UnicodeScalarView(s[nameStart..<i]))
  while i < s.count && isJSWhitespace(s[i]) { i += 1 }
  guard i < s.count && s[i] == "=" else { return nil }
  i += 1
  if i < s.count && s[i] == "=" { return nil }
  while i < s.count && isJSWhitespace(s[i]) { i += 1 }
  return (name, i)
}

// MARK: - Tokenizer

private enum Token {
  case string(String, col: Int)
  case number(Double, col: Int)
  case ident(String, col: Int)
  case state(String, col: Int)
  case punct(Unicode.Scalar, col: Int)
  case eof(col: Int)

  var col: Int {
    switch self {
    case .string(_, let c), .number(_, let c), .ident(_, let c), .state(_, let c), .punct(_, let c), .eof(let c): c
    }
  }
}

private let punctuation: Set<Unicode.Scalar> = ["(", ")", "[", "]", "{", "}", ",", "=", ":"]

private func tokenize(_ s: [Unicode.Scalar], offset: Int, warnings: inout [Issue]) throws -> [Token] {
  var tokens: [Token] = []
  var i = 0
  func col(_ at: Int) -> Int { offset + at + 1 }

  while i < s.count {
    let c = s[i]
    if c == " " || c == "\t" {
      i += 1
    } else if c == "#" {
      break  // comment: the rest of the line is ignored
    } else if c == "\"" {
      let startCol = col(i)
      var value = String.UnicodeScalarView()
      i += 1
      while true {
        guard i < s.count else { throw LineError(code: .unterminatedString, message: "string is never closed", col: startCol) }
        let ch = s[i]
        if ch == "\"" {
          i += 1
          break
        }
        if ch == "\\" {
          guard i + 1 < s.count else { throw LineError(code: .unterminatedString, message: "string is never closed", col: startCol) }
          let next = s[i + 1]
          switch next {
          case "\"": value.append("\"")
          case "\\": value.append("\\")
          case "n": value.append("\n")
          default:
            // Lenient: keep an unknown escape as literal text rather than dropping the line.
            value.append("\\")
            value.append(next)
            warnings.append(Issue(code: .unknownEscape, message: "col \(col(i)): unknown escape \"\\\(next)\" kept as literal text"))
          }
          i += 2
          continue
        }
        value.append(ch)
        i += 1
      }
      tokens.append(.string(String(value), col: startCol))
    } else if c == "'" {
      throw LineError(code: .syntax, message: "strings must use double quotes", col: col(i))
    } else if c == "$" {
      var j = i + 1
      guard j < s.count && isIdentStart(s[j]) else {
        throw LineError(code: .syntax, message: #"expected a state name after "$""#, col: col(i))
      }
      while j < s.count && isIdentChar(s[j]) { j += 1 }
      tokens.append(.state(String(String.UnicodeScalarView(s[i..<j])), col: col(i)))
      i = j
    } else if isDigit(c) || c == "." || c == "-" {
      guard let end = numberEnd(s, from: i) else {
        throw LineError(code: .syntax, message: "unexpected \"\(c)\"", col: col(i))
      }
      if end < s.count && isIdentChar(s[end]) {
        let shown = String(String.UnicodeScalarView(s[i...end]))
        throw LineError(code: .syntax, message: "invalid number \"\(shown)…\"", col: col(i))
      }
      tokens.append(.number(jsNumber(String(String.UnicodeScalarView(s[i..<end]))), col: col(i)))
      i = end
    } else if isIdentStart(c) {
      var j = i
      while j < s.count && isIdentChar(s[j]) { j += 1 }
      tokens.append(.ident(String(String.UnicodeScalarView(s[i..<j])), col: col(i)))
      i = j
    } else if punctuation.contains(c) {
      tokens.append(.punct(c, col: col(i)))
      i += 1
    } else {
      throw LineError(code: .syntax, message: "unexpected character \"\(c)\"", col: col(i))
    }
  }
  tokens.append(.eof(col: col(s.count)))
  return tokens
}

/// The end of `-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?` starting at `i`, or nil if it doesn't match.
private func numberEnd(_ s: [Unicode.Scalar], from start: Int) -> Int? {
  var i = start
  func digits() -> Int {
    let from = i
    while i < s.count && isDigit(s[i]) { i += 1 }
    return i - from
  }
  if i < s.count && s[i] == "-" { i += 1 }
  if digits() > 0 {
    if i < s.count && s[i] == "." {
      i += 1
      _ = digits()
    }
  } else if i < s.count && s[i] == "." {
    i += 1
    if digits() == 0 { return nil }
  } else {
    return nil
  }
  if i < s.count && (s[i] == "e" || s[i] == "E") {
    let mark = i
    i += 1
    if i < s.count && (s[i] == "+" || s[i] == "-") { i += 1 }
    if digits() == 0 { i = mark }
  }
  return i
}

/// JavaScript's `Number(text)` for text matching the number pattern: "1." is 1, ".5" is 0.5, and a
/// value too large for a Double is ±infinity (which validation then rejects).
private func jsNumber(_ text: String) -> Double {
  var mantissa = text
  var exponent = ""
  if let e = text.firstIndex(where: { $0 == "e" || $0 == "E" }) {
    mantissa = String(text[..<e])
    exponent = String(text[e...])
  }
  let negative = mantissa.hasPrefix("-")
  if negative { mantissa.removeFirst() }
  if mantissa.hasPrefix(".") { mantissa = "0" + mantissa }
  if mantissa.hasSuffix(".") { mantissa += "0" }
  let value = Double(mantissa + exponent) ?? .nan
  return negative ? -value : value
}

// MARK: - Parser

private struct TokenParser {
  let tokens: [Token]
  var i = 0

  init(tokens: [Token]) {
    self.tokens = tokens
  }

  mutating func callStatement(_ id: String) throws -> RawStatement {
    guard case .ident(let callee, _) = peek(), isPunct("(", ahead: 1) else {
      throw LineError(code: .syntax, message: "expected a component call such as Text(…)", col: peek().col)
    }
    i += 1
    let (args, named) = try argumentList()
    try expectEnd()
    return .call(id: id, callee: callee, args: args, named: named)
  }

  mutating func stateStatement(_ key: String) throws -> RawStatement {
    if case .eof(let col) = peek() { throw LineError(code: .syntax, message: "expected a value", col: col) }
    let v = try value()
    try expectEnd()
    return .state(key: key, value: v)
  }

  /// `( [arg {, arg}] [,] )` where named args (`name = value`) come after positional ones.
  private mutating func argumentList() throws -> ([RawValue], [(String, RawValue)]) {
    try expectPunct("(")
    var args: [RawValue] = []
    var named: [(String, RawValue)] = []
    while !isPunct(")") {
      let token = peek()
      if case .ident(let name, _) = token, isPunct("=", ahead: 1) {
        i += 2
        named.append((name, try value()))
      } else {
        if !named.isEmpty {
          throw LineError(code: .syntax, message: "positional arguments must come before named ones", col: token.col)
        }
        args.append(try value())
      }
      if !isPunct(")") { try expectPunct(",") }
    }
    try expectPunct(")")
    return (args, named)
  }

  private mutating func value() throws -> RawValue {
    let token = peek()
    switch token {
    case .string(let s, _):
      i += 1
      return .string(s)
    case .number(let n, _):
      i += 1
      return .number(n)
    case .state(let key, _):
      i += 1
      return .state(key)
    case .ident(let name, _):
      i += 1
      if name == "true" || name == "false" { return .boolean(name == "true") }
      if name == "null" { return .null }
      if isPunct("(") {
        _ = try argumentList()  // parsed for well-formedness, then rejected by validation
        return .call(name)
      }
      return .ident(name)
    case .punct(let p, let col):
      if p == "[" { return try array() }
      if p == "{" { return try object() }
      throw LineError(code: .syntax, message: "unexpected \"\(p)\"", col: col)
    case .eof(let col):
      throw LineError(code: .syntax, message: "line ended where a value was expected", col: col)
    }
  }

  private mutating func array() throws -> RawValue {
    try expectPunct("[")
    var items: [RawValue] = []
    while !isPunct("]") {
      items.append(try value())
      if !isPunct("]") { try expectPunct(",") }
    }
    try expectPunct("]")
    return .array(items)
  }

  private mutating func object() throws -> RawValue {
    try expectPunct("{")
    var entries: [(String, RawValue)] = []
    while !isPunct("}") {
      let key: String
      switch peek() {
      case .ident(let k, _), .string(let k, _): key = k
      default: throw LineError(code: .syntax, message: "expected an object key", col: peek().col)
      }
      i += 1
      try expectPunct(":")
      entries.append((key, try value()))
      if !isPunct("}") { try expectPunct(",") }
    }
    try expectPunct("}")
    return .object(entries)
  }

  private func peek(_ ahead: Int = 0) -> Token {
    tokens[min(i + ahead, tokens.count - 1)]
  }

  private func isPunct(_ p: Unicode.Scalar, ahead: Int = 0) -> Bool {
    if case .punct(let q, _) = peek(ahead) { return q == p }
    return false
  }

  private mutating func expectPunct(_ p: Unicode.Scalar) throws {
    let token = peek()
    guard isPunct(p) else {
      let found: String = switch token {
      case .eof: "end of line"
      case .string(let s, _), .ident(let s, _), .state(let s, _): "\"\(s)\""
      case .number(let n, _): "\"\(n)\""
      case .punct(let q, _): "\"\(q)\""
      }
      throw LineError(code: .syntax, message: "expected \"\(p)\" but found \(found)", col: token.col)
    }
    i += 1
  }

  private func expectEnd() throws {
    if case .eof = peek() { return }
    throw LineError(code: .syntax, message: "unexpected text after the statement", col: peek().col)
  }
}
