// Performance budget for the store SwiftUI reads (PLAN-HARDENING.md C.3): a 20,000-component stream,
// written line by line through OmniStore, must take under 5 seconds. It fails if anything goes back to
// copying the whole document on every line.
import Foundation
import Testing
@testable import OmniIRSwiftUI

private func storeScreen(_ n: Int) -> [String] {
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

@MainActor
@Suite("Store performance")
struct StorePerfTests {
  @Test("streams a 20,000-component screen through OmniStore in under 5 seconds")
  func budget() {
    func run(_ n: Int) -> (Duration, OmniStore) {
      let store = OmniStore(tools: ["payments.confirm": Tool.acceptsAnything])
      let lines = storeScreen(n)
      let elapsed = ContinuousClock().measure {
        for line in lines {
          store.write(line + "\n")
          _ = store.slot("root") // a view reading the document after each line, as SwiftUI would
        }
        store.end()
      }
      return (elapsed, store)
    }
    _ = run(1000)
    for n in [1000, 5000] { print("perf (store): \(n) components in \(run(n).0)") }
    let (elapsed, store) = run(20_000)
    print("perf (store): 20000 components in \(elapsed)")
    #expect(store.issues.isEmpty)
    #expect(store.document.nodes.count >= 20_000)
    #expect(elapsed < .seconds(5))
  }
}
