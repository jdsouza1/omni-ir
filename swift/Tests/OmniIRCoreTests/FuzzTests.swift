// Seeded no-crash fuzzing of the Swift parser (PLAN-HARDENING.md, B.3). SwiftUI can't catch a
// failing view or a crashing parser, so whatever arrives (random bytes, invalid UTF-8, token soup,
// edited fixtures, extreme nesting) the parser must never crash, every issue must be well-formed, and
// how the bytes are split must never change the result. A crash here aborts the test run, which fails it.
// The differential corpus (ConformanceTests) checks that results agree with the other parsers.
import Foundation
import Testing
@testable import OmniIRCore

/// A small seeded generator (SplitMix64), so every run is reproducible from its seed.
struct SeededGenerator: RandomNumberGenerator {
  private var state: UInt64
  init(seed: UInt64) { state = seed }
  mutating func next() -> UInt64 {
    state &+= 0x9E37_79B9_7F4A_7C15
    var z = state
    z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
    z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
    return z ^ (z >> 31)
  }
}

private let runs = Int(ProcessInfo.processInfo.environment["FUZZ_RUNS"] ?? "") ?? 1000
private let seed = UInt64(ProcessInfo.processInfo.environment["FUZZ_SEED"] ?? "") ?? 20_261_005

private let fuzzTools: ToolRegistry = Dictionary(uniqueKeysWithValues: [
  "payments.confirm", "auth.sendMagicLink", "profile.update", "orders.requestReturn",
  "support.createTicket", "bookings.reserve", "assistant.ask", "settings.update",
].map { ($0, Tool.acceptsAnything) })
private let fuzzAssets: Set<String> = ["cabin-pines", "shirt", "tote"]

private let tokens: [String] = [
  "root", "a", "b", "pay", "$a", "$__proto__", "__proto__", " = ", "=", "Card", "Text", "Button", "List", "ListItem",
  "Table", "TableRow", "Tabs", "Tab", "BarChart", "Series", "PieChart", "Slice", "McpMutation", "Image", "Input",
  "(", ")", "[", "]", "{", "}", ",", ":", "\"", "\\", "\\\"", "\\n", "\\u0041", "42", "-0", "1e999", "-1e-400", ".5",
  "true", "false", "null", "# ", "tool=", "\"payments.confirm\"", "params=", "action=", "label=", "alt=", "+",
  " ", "\t", "\n", "\r\n", "\r", "é", "😀", "\u{0}", "\u{200B}", "\u{FEFF}", "а",
]

private func fixtures() -> [String] {
  let dir = repoRoot.appendingPathComponent("fixtures")
  guard let walker = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil) else { return [] }
  return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "omni" }.sorted { $0.path < $1.path }
    .compactMap { try? String(contentsOf: $0, encoding: .utf8) }
}

private func pick<T>(_ items: [T], _ r: inout SeededGenerator) -> T {
  items[Int.random(in: 0..<items.count, using: &r)]
}

private func tokenSoup(_ r: inout SeededGenerator) -> String {
  (0..<Int.random(in: 1..<120, using: &r)).map { _ in pick(tokens, &r) }.joined()
}

private func edited(_ fixtures: [String], _ r: inout SeededGenerator) -> String {
  var t = Array(pick(fixtures, &r).unicodeScalars)
  for _ in 0..<Int.random(in: 1..<6, using: &r) {
    let at = Int.random(in: 0...t.count, using: &r)
    switch Int.random(in: 0..<4, using: &r) {
    case 0: t.removeSubrange(at..<min(t.count, at + Int.random(in: 0..<20, using: &r)))
    case 1: t.insert(contentsOf: pick(tokens, &r).unicodeScalars, at: at)
    case 2: t.removeSubrange(at..<t.count)
    default: t.insert(contentsOf: tokenSoup(&r).unicodeScalars, at: at)
    }
  }
  var s = ""
  s.unicodeScalars.append(contentsOf: t)
  return s
}

/// Lines at the edges: deep nesting, the length limit, many parts.
private func extreme(_ r: inout SeededGenerator) -> String {
  switch Int.random(in: 0..<6, using: &r) {
  case 0:
    return "root = Card(" + String(repeating: "[", count: Int.random(in: 1..<9000, using: &r))
      + String(repeating: "]", count: Int.random(in: 0..<9000, using: &r)) + ")\n"
  case 1:
    return "$a = " + String(repeating: "{x: ", count: Int.random(in: 1..<4000, using: &r)) + "1"
      + String(repeating: "}", count: Int.random(in: 0..<4000, using: &r)) + "\n"
  case 2:
    return "root = Text(\"" + String(repeating: "x", count: Limits.lineLength - 15 + Int.random(in: 0..<30, using: &r)) + "\")\n"
  case 3:
    let n = Int.random(in: 1..<2000, using: &r)
    return "root = Stack([" + (1...n).map { "c\($0)" }.joined(separator: ", ") + "])\n"
      + (1...Int.random(in: 1..<300, using: &r)).map { "c\($0) = Text(\"\($0)\")\n" }.joined()
  case 4:
    return String(repeating: "a(", count: Int.random(in: 1..<9000, using: &r)) + "\n"
  default:
    return (1...Int.random(in: 1..<3000, using: &r)).map { "$s\($0) = \($0)\n" }.joined() + "root = Divider()\n"
  }
}

private struct FuzzResult: Equatable {
  var issues: Set<ExpectedIssue>
  var nodes: Set<String>
  var state: [String: JSON]
  var missing: Set<String>
}

private func parse(_ chunks: [[UInt8]]) -> FuzzResult {
  let parser = OmniParser(tools: fuzzTools, assets: fuzzAssets)
  for chunk in chunks { parser.write(bytes: chunk) }
  parser.end()
  let doc = parser.document
  return FuzzResult(
    issues: Set(parser.issues.map { ExpectedIssue(line: $0.line, code: $0.code.rawValue) }),
    nodes: Set(doc.nodes.keys),
    state: doc.state.mapValues(json),
    missing: Set(doc.missing)
  )
}

private func split(_ bytes: [UInt8], _ r: inout SeededGenerator) -> [[UInt8]] {
  guard !bytes.isEmpty else { return [bytes] }
  let cuts = Set((0..<Int.random(in: 0..<12, using: &r)).map { _ in Int.random(in: 0..<bytes.count, using: &r) }).sorted()
  var parts: [[UInt8]] = []
  var from = 0
  for at in cuts {
    parts.append(Array(bytes[from..<at]))
    from = at
  }
  parts.append(Array(bytes[from...]))
  return parts
}

/// Parse whole and split; issues well-formed, both results equal. A crash fails the whole run.
private func check(_ label: String, _ input: [UInt8], _ r: inout SeededGenerator) {
  let whole = parse([input])
  let lineCount = String(decoding: input, as: UTF8.self).split(omittingEmptySubsequences: false) { $0 == "\n" || $0 == "\r" || $0 == "\r\n" }.count + 1
  for issue in whole.issues {
    if let line = issue.line { #expect((1...max(1, lineCount)).contains(line), "\(label): line \(line) of \(lineCount)") }
  }
  let pieces = split(input, &r)
  #expect(parse(pieces) == whole, "\(label): splitting at \(pieces.map(\.count)) changed the result")
}

@Suite("Fuzz: the parser never crashes")
struct FuzzTests {
  @Test("random bytes, including invalid UTF-8")
  func bytes() {
    var r = SeededGenerator(seed: seed)
    for n in 0..<runs {
      let input = (0..<Int.random(in: 0..<2000, using: &r)).map { _ in UInt8.random(in: 0...255, using: &r) }
      check("bytes #\(n) (seed \(seed))", input, &r)
    }
  }

  @Test("token soup")
  func soup() {
    var r = SeededGenerator(seed: seed &+ 1)
    for n in 0..<runs { check("soup #\(n) (seed \(seed))", Array(tokenSoup(&r).utf8), &r) }
  }

  @Test("edited fixtures")
  func editedFixtures() {
    var r = SeededGenerator(seed: seed &+ 2)
    let all = fixtures()
    #expect(all.count >= 10, "found \(all.count) fixtures")
    guard !all.isEmpty else { return }
    for n in 0..<runs { check("edited #\(n) (seed \(seed))", Array(edited(all, &r).utf8), &r) }
  }

  @Test("extreme lines: deep nesting, the length limit, many parts")
  func extremeLines() {
    var r = SeededGenerator(seed: seed &+ 3)
    for n in 0..<max(50, runs / 10) { check("extreme #\(n) (seed \(seed))", Array(extreme(&r).utf8), &r) }
  }
}
