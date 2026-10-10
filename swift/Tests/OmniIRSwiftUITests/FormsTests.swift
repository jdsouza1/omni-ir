// Fields and confirmations in the store (SPEC.md section 8, Fields, [8.5]–[8.6]; section 9,
// Confirmations, [9.1]–[9.3]). Port of tests/renderer.forms.test.tsx; the field rules themselves are
// covered by the shared cases in OmniIRCoreTests' FieldsConformanceTests.
import Foundation
import Testing
@testable import OmniIRSwiftUI

private let tools: ToolRegistry = [
  "support.createTicket": Tool { params in
    guard case .text(let subject)? = params["subject"], !subject.isEmpty else { return ["subject: required"] }
    return []
  },
  "payments.confirm": .acceptsAnything,
]

private let ticket = """
  root = Card([email, search, subject, send])
  $email = ""
  email = Input($email, label="Email", required=true, format="email")
  $q = ""
  search = Input($q, label="Search", required=true)
  $subject = ""
  subject = Input($subject, label="Subject", maxLength=10)
  send = Button("Send", action="go")
  go = McpMutation(send, tool="support.createTicket", params={email: $email, subject: $subject})

  """

private let payment = """
  root = Card([pay])
  $amount = 42.5
  pay = Button("Pay", action="payM")
  payM = McpMutation(pay, tool="payments.confirm", params={amount: $amount, note: "{amount}"})

  """

@MainActor
@Suite("Fields and confirmations")
struct FormsTests {
  @Test("a message shows only once the person leaves the field, and stays until it passes")
  func messageAfterLeaving() {
    let store = OmniStore(tools: tools)
    store.write(ticket)
    #expect(store.fieldProblem("email") == FieldProblem("required"))
    #expect(store.visibleFieldProblem("email") == nil, "not before the person has left the field")
    store.showField("email")
    #expect(store.visibleFieldProblem("email") == FieldProblem("required"))
    store.setState("$email", .text("ann@"))
    #expect(store.visibleFieldProblem("email") == FieldProblem("invalidEmail"))
    store.setState("$email", .text("ann@example.com"))
    #expect(store.visibleFieldProblem("email") == nil)
    #expect(store.fieldProblem("send") == nil, "only fields have problems")
  }

  @Test("a press checks the fields its params read first: they show, focus goes to the first, nothing runs")
  func fieldsBlockThePress() async {
    let store = OmniStore(tools: tools)
    store.write(ticket)
    store.setState("$subject", .text("far too long a subject"))
    var sent: [MutationCall] = []
    var events: [RendererEvent] = []
    let focus = await store.press("send", onMutation: { sent.append($0) }, report: { events.append($0) })
    #expect(focus == "email")
    #expect(sent.isEmpty)
    #expect(events.isEmpty, "a field problem isn't a renderer error: the person can fix it")
    #expect(store.shownFields == ["email", "subject"], "the fields it reads, not the search box")
    #expect(store.visibleFieldProblem("subject") == FieldProblem("tooLong", ["max": "10"]))
    #expect(store.visibleFieldProblem("search") == nil, "a field no params read blocks nothing")
  }

  @Test("once the fields pass, the tool's own check still runs")
  func toolCheckAfterFields() async {
    let store = OmniStore(tools: tools)
    store.write(ticket)
    store.setState("$email", .text("ann@example.com"))
    var events: [RendererEvent] = []
    var sent: [MutationCall] = []
    #expect(await store.press("send", onMutation: { sent.append($0) }, report: { events.append($0) }) == nil)
    #expect(sent.isEmpty)
    guard case .error(let issue)? = events.first else { Testing.Issue.record("expected mutation_blocked"); return }
    #expect(issue.code == .mutationBlocked)
    store.setState("$subject", .text("Help"))
    await store.press("send", onMutation: { sent.append($0) }, report: { events.append($0) })
    #expect(sent.map(\.tool) == ["support.createTicket"])
  }

  @Test("the app's confirmation runs last, filled once with the params as plain text, and cancel sends nothing")
  func confirmation() async {
    let store = OmniStore(tools: tools, confirm: ["payments.confirm": "Pay {amount}? ({note})"])
    store.write(payment)
    var asked: [String] = []
    var sent: [MutationCall] = []
    await store.press("pay", onMutation: { sent.append($0) }, report: { _ in }, askConfirmation: { asked.append($0); return false })
    #expect(asked == ["Pay 42.5? ({amount})"], "a value is never read as a placeholder")
    #expect(sent.isEmpty)
    await store.press("pay", onMutation: { sent.append($0) }, report: { _ in }, askConfirmation: { _ in true })
    #expect(sent.count == 1)
  }

  @Test("the app can write the sentence itself, to show the amount as currency")
  func confirmationClosure() async {
    let usd = Confirmation { params in
      guard case .number(let amount)? = params["amount"] else { return "Pay?" }
      return "Pay \(amount.formatted(.currency(code: "USD").locale(Locale(identifier: "en_US"))))?"
    }
    let store = OmniStore(tools: tools, confirm: ["payments.confirm": usd])
    store.write(payment)
    var asked: [String] = []
    await store.press("pay", onMutation: { _ in }, report: { _ in }, askConfirmation: { asked.append($0); return false })
    #expect(asked == ["Pay $42.50?"])
  }

  @Test("a tool that needs confirmation never runs when the view can't ask")
  func noAsker() async {
    let store = OmniStore(tools: tools, confirm: ["payments.confirm": "Pay {amount}?"])
    store.write(payment)
    var sent: [MutationCall] = []
    await store.press("pay", onMutation: { sent.append($0) }, report: { _ in })
    #expect(sent.isEmpty)
    let plain = OmniStore(tools: tools)
    plain.write(payment)
    await plain.press("pay", onMutation: { sent.append($0) }, report: { _ in })
    #expect(sent.count == 1, "no confirmation, no question")
  }

  @Test("field messages in the renderer's words, with the app's own words when given")
  func messages() {
    let english = OmniStrings()
    #expect(english.field(FieldProblem("tooLong", ["max": "10"])) == "Use 10 characters or fewer.")
    #expect(english.field(FieldProblem("required")) == "This is required.")
    var french = OmniStrings()
    french.required = "Obligatoire"
    #expect(french.field(FieldProblem("required")) == "Obligatoire")
  }
}
