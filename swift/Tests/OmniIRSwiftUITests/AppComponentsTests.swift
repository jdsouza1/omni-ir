// App-defined components in the store (Step 20, PLAN-APPCOMPONENTS.md B.2): the demo app's own
// declarations, read from app/components.json as the demo app reads them, checked like the catalog's,
// with $state read for views and field checks before a press. Port of the Kotlin AppComponentsTest.
import Foundation
import Testing
@testable import OmniIRSwiftUI

private let repoRoot = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

private func registry() throws -> (components: AppComponents, pictures: [PicturePattern]) {
  try appRegistry(fromJSON: Data(contentsOf: repoRoot.appendingPathComponent("app/components.json")))
}

private func product() throws -> String {
  try String(contentsOf: repoRoot.appendingPathComponent("fixtures/product.omni"), encoding: .utf8)
}

private let tools: ToolRegistry = ["cart.add": .acceptsAnything]

@MainActor
@Suite("App components")
struct AppComponentsTests {
  private func store() throws -> OmniStore {
    let r = try registry()
    return OmniStore(tools: tools, assets: ["tote"], components: r.components, pictures: r.pictures)
  }

  @Test("reads the app's declarations from JSON and refuses malformed ones")
  func declarations() throws {
    let r = try registry()
    #expect(Set(r.components.names) == ["ProductCard", "QuantityPicker"])
    #expect(r.pictures.map(\.prefix) == ["product-"])
    #expect(throws: AppComponentError.self) { try appRegistry(fromJSON: Data(#"{"components": {"Card": {"description": "x", "props": {}}}}"#.utf8)) }
    #expect(throws: AppComponentError.self) { try appRegistry(fromJSON: Data("[]".utf8)) }
  }

  @Test("streams with app components draw without issues, and views get values, never state references")
  func drawn() throws {
    let store = try store()
    store.write(try product())
    store.end()
    #expect(store.issues.isEmpty)
    guard let card = store.document.nodes["card"], let qty = store.document.nodes["qty"] else {
      Testing.Issue.record("the product screen should have arrived")
      return
    }
    #expect(card.type == .app && card.appName == "ProductCard")
    #expect(card.children == ["add", "later"])
    let props = store.appProps(qty)
    #expect(props["value"] == .number(1))
    #expect(props["label"] == .text("How many"))
    #expect(!props.values.contains { if case .state = $0 { true } else { false } })
  }

  @Test("an app field joins the checks before a press, and edits its state through the store")
  func field() async throws {
    let store = try store()
    store.write(try product())
    store.setState("$qty", .null)
    var sent: [MutationCall] = []
    #expect(await store.press("add", onMutation: { sent.append($0) }, report: { _ in }) == "qty")
    #expect(sent.isEmpty)
    #expect(store.visibleFieldProblem("qty") == FieldProblem("required"))
    store.setState("$qty", .number(2))
    #expect(store.visibleFieldProblem("qty") == nil)
    await store.press("add", onMutation: { sent.append($0) }, report: { _ in })
    #expect(sent.first?.params == ["productId": .text("1042"), "quantity": .number(2)])
  }

  @Test("without the app's declarations, its components are unknown")
  func undeclared() throws {
    let store = OmniStore(tools: tools, assets: ["tote"])
    store.write(try product())
    #expect(store.issues.contains { $0.code == .unknownComponent && $0.id == "card" })
  }
}
