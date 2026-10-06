// The incremental document checks (PLAN-HARDENING.md C.2) must report exactly what the whole-document
// check reports: compared on every line of every fuzz corpus stream and every fixture. Also the
// parser's performance budget (C.3).
import Foundation
import Testing
@testable import OmniIRCore

private let indexTools: ToolRegistry = Dictionary(uniqueKeysWithValues: [
  "payments.confirm", "auth.sendMagicLink", "profile.update", "orders.requestReturn",
  "support.createTicket", "bookings.reserve", "assistant.ask", "settings.update",
].map { ($0, Tool.acceptsAnything) })

private func keys(_ issues: [OmniIRCore.Issue]) -> Set<String> { Set(issues.map { "\($0.code.rawValue):\($0.id ?? "")" }) }

private func compare(_ text: String) {
  var index = DocumentIndex()
  var accepted: [Statement] = []
  let context = ValidationContext(tools: indexTools, assets: ["cabin-pines", "shirt", "tote"])
  for line in text.split(omittingEmptySubsequences: false, whereSeparator: { $0 == "\n" || $0 == "\r" || $0 == "\r\n" }) {
    guard case .statement(let raw, _) = parseLine(String(line)), case .ok(let statement) = validateStatement(raw, context) else { continue }
    let whole = validateDocument(accepted + [statement], complete: false)
    #expect(keys(index.check(statement)) == keys(whole), "\(line)")
    if whole.isEmpty {
      accepted.append(statement)
      index.add(statement)
    }
  }
}

/// A valid screen of about `n` components (as scripts/perf.ts makes them).
func perfScreen(_ n: Int) -> [String] {
  var lines: [String] = []
  let leaves = max(1, n - 3)
  let groups = (leaves + 199) / 200
  lines.append("root = Stack([" + (0..<groups).map { "g\($0)" }.joined(separator: ", ") + ", pay])")
  var made = 0
  for g in 0..<groups {
    let count = min(200, leaves - made)
    lines.append("g\(g) = Stack([" + (0..<count).map { "t\(made + $0)" }.joined(separator: ", ") + "])")
    for k in 0..<count { lines.append("t\(made + k) = Text(\"Row \(made + k)\", tone=\"muted\")") }
    made += count
  }
  lines.append("$amount = 42.5")
  lines.append("pay = Button(\"Pay\", action=\"pay\")")
  lines.append("payM = McpMutation(pay, tool=\"payments.confirm\", params={amount: $amount, note: \"\"})")
  return lines
}

@Suite("Incremental document checks")
struct DocumentIndexTests {
  @Test("agree with validateDocument on every corpus stream and fixture")
  func agrees() throws {
    struct File: Decodable { let cases: [ConformanceCase] }
    let corpus = try JSONDecoder().decode(File.self, from: Data(contentsOf: repoRoot.appendingPathComponent("fuzz/corpus.json"))).cases
    for c in corpus { compare(c.text) }
    let dir = repoRoot.appendingPathComponent("fixtures")
    let files = (FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil)?.compactMap { $0 as? URL } ?? []).filter { $0.pathExtension == "omni" }
    for file in files { compare(try String(contentsOf: file, encoding: .utf8)) }
    #expect(corpus.count + files.count > 2000)
  }

  @Test("parses a 20,000-component stream line by line in under 5 seconds")
  func budget() {
    func parse(_ n: Int) -> (Duration, OmniParser) {
      let parser = OmniParser(tools: ["payments.confirm": Tool.acceptsAnything])
      let lines = perfScreen(n)
      let clock = ContinuousClock()
      let elapsed = clock.measure {
        for line in lines { parser.write(line + "\n") }
        parser.end()
      }
      return (elapsed, parser)
    }
    _ = parse(1000)
    for n in [1000, 5000] { print("perf: \(n) components in \(parse(n).0)") }
    let (elapsed, parser) = parse(20_000)
    print("perf: 20000 components in \(elapsed)")
    #expect(parser.issues.isEmpty)
    #expect(parser.document.nodes.count >= 20_000)
    #expect(elapsed < .seconds(5))
  }
}
