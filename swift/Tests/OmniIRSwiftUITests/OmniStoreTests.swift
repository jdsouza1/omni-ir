// The renderer's model: what each node resolves to, governance, actions and formats.
// These run on every platform; the SwiftUI views themselves are checked on macOS and iOS.
import Foundation
import Testing
@testable import OmniIRSwiftUI

private let tools: ToolRegistry = [
  "payments.confirm": Tool { params in
    guard case .number(let amount)? = params["amount"], amount > 0 else { return ["amount: must be more than 0"] }
    return []
  },
  "bookings.reserve": .acceptsAnything,
]

private let payment = """
  root = Card([title, amountField, pay, cancel])
  title = Heading("Confirm payment")
  $amount = 42.5
  amountField = Text($amount, format="currency")
  pay = Button("Pay", action="pay")
  payM = McpMutation(pay, tool="payments.confirm", params={amount: $amount, note: "Table 4"})
  cancel = Button("Cancel", variant="secondary")

  """

@MainActor
@Suite("Renderer model")
struct OmniStoreTests {
  @Test("slots: a node once it arrives, a placeholder before, a fallback if it never does")
  func slots() {
    let store = OmniStore(tools: tools)
    store.write("root = Card([title, gone])\n")
    #expect(store.slot("title") == .pending)
    store.write("title = Heading(\"Hi\")\n")
    guard case .node(let title) = store.slot("title") else { Testing.Issue.record("title should have arrived"); return }
    #expect(store.text(title.props["text"]) == "Hi")
    store.end()
    #expect(store.slot("gone") == .missing)
  }

  @Test("$state props show the current value, and edits update every use")
  func stateText() {
    let store = OmniStore(tools: tools)
    store.write("root = Stack([f, echo])\n$note = \"\"\nf = Input($note, label=\"Note\")\necho = Text($note)\n")
    store.setState("$note", .text("hello"))
    guard case .node(let echo) = store.slot("echo") else { Testing.Issue.record("echo missing"); return }
    #expect(store.text(echo.props["text"]) == "hello")
    #expect(store.stateText("$note") == "hello")
  }

  @Test("a governed Button is disabled until its McpMutation arrives, then sends resolved params")
  func governedPress() async {
    let store = OmniStore(tools: tools)
    store.write(payment.components(separatedBy: "payM =")[0])
    #expect(store.governance(for: "pay") == .ungoverned)
    store.write("payM =" + payment.components(separatedBy: "payM =")[1])
    store.end()
    #expect(store.governance(for: "pay") == .ready(tool: "payments.confirm"))

    var calls: [MutationCall] = []
    var events: [RendererEvent] = []
    await store.press("pay", onMutation: { calls.append($0) }, report: { events.append($0) })
    #expect(calls == [MutationCall(id: "payM", target: "pay", tool: "payments.confirm", params: ["amount": .number(42.5), "note": .text("Table 4")])])
    #expect(events.isEmpty)
  }

  @Test("params that fail the tool's check block the Button until a value it used changes")
  func blocked() async {
    let store = OmniStore(tools: tools)
    store.write(payment.replacingOccurrences(of: "$amount = 42.5", with: "$amount = 0"))
    store.end()
    var calls = 0
    var events: [RendererEvent] = []
    await store.press("pay", onMutation: { _ in calls += 1 }, report: { events.append($0) })
    #expect(calls == 0)
    let codes = events.compactMap { event -> IssueCode? in
      if case .error(let issue) = event { return issue.code }
      return nil
    }
    #expect(codes == [.mutationBlocked])
    #expect(store.governance(for: "pay") == .blocked(tool: "payments.confirm", message: "amount: must be more than 0"))
    store.setState("$amount", .number(5))
    #expect(store.governance(for: "pay") == .ready(tool: "payments.confirm"))
  }

  @Test("a failing handler is reported, and a Button without an action only reports the press")
  func handlerFailureAndPlainPress() async {
    struct Refused: Error {}
    let store = OmniStore(tools: tools)
    store.write(payment)
    store.end()
    var events: [RendererEvent] = []
    await store.press("pay", onMutation: { _ in throw Refused() }, report: { events.append($0) })
    await store.press("cancel", onMutation: { _ in Testing.Issue.record("cancel must never reach the backend") }, report: { events.append($0) })
    #expect(events.count == 2)
    if case .error(let issue) = events[0] { #expect(issue.code == .handlerFailed && issue.id == "pay") }
    #expect(events[1] == .press(id: "cancel"))
    #expect(!store.isRunning("pay"))
  }

  @Test("text formats: currency, a date-only value on its own day in every time zone, other text as is")
  func formats() {
    let us = Locale(identifier: "en_US")
    #expect(Format.text(.number(42.5), format: "currency", currency: nil, locale: us) == "$42.50")
    #expect(Format.text(.number(1200), format: "currency", currency: "EUR", locale: us) == "€1,200.00")
    #expect(Format.text(.text("2026-09-30"), format: "date", currency: nil, locale: us) == "Sep 30, 2026")
    #expect(Format.text(.text("next Tuesday"), format: "date", currency: nil, locale: us) == "next Tuesday")
    #expect(Format.text(.number(4.0), format: nil, currency: nil, locale: us) == "4")
    #expect(Format.text(.number(4.96), format: nil, currency: nil, locale: us) == "4.96")
    #expect(Format.text(.bool(true), format: nil, currency: nil, locale: us) == "true")
    #expect(Format.text(.null, format: nil, currency: nil, locale: us) == "")
  }

  @Test("Select shows its option or nothing chosen; Switch reads true only for true; edits update state")
  func choices() {
    let store = OmniStore(tools: tools)
    store.write("""
      root = Stack([s, w])
      $size = "XL"
      s = Select($size, label="Size", options=["S", "M"])
      $news = false
      w = Switch($news, label="News")

      """)
    #expect(store.chosenOption("$size", options: ["S", "M"]) == "")
    store.setState("$size", .text("M"))
    #expect(store.chosenOption("$size", options: ["S", "M"]) == "M")
    #expect(!store.stateBool("$news"))
    store.setState("$news", .bool(true))
    #expect(store.stateBool("$news"))
  }

  @Test("a table's headings and cells, numbers marked for end alignment; Tabs' labels as their lines arrive")
  func tablesAndTabs() {
    let store = OmniStore(tools: tools)
    store.write("""
      root = Stack([t, tabs])
      t = Table(["Plan", "Projects"], [r])
      r = TableRow(["Pro", 1200])
      tabs = Tabs([a, b])
      a = Tab("Profile", [])

      """)
    guard case .node(let table) = store.slot("t"), case .node(let row) = store.slot("r") else { Testing.Issue.record("table should have arrived"); return }
    #expect(Format.texts(table.props["columns"]) == ["Plan", "Projects"])
    let cells = Format.cells(row.props["cells"], locale: Locale(identifier: "en_US"))
    #expect(cells == [Format.Cell(text: "Pro", isNumber: false), Format.Cell(text: "1,200", isNumber: true)])
    #expect(store.tabLabels(["a", "b"]) == ["Profile", nil])
    store.write("b = Tab(\"Alerts\", [])\n")
    #expect(store.tabLabels(["a", "b"]) == ["Profile", "Alerts"])
  }

  @Test("charts: series and slices as they arrive, keeping their places; values, ticks and shares in the chart's format")
  func charts() {
    let store = OmniStore(tools: tools)
    store.write("""
      root = Stack([sales, pie])
      sales = BarChart("Sales", ["Jul", "Aug"], [a, b], format="currency")
      b = Series("In store", [900, 1100])
      pie = PieChart("Channels", [web, app])
      web = Slice("Website", 52)

      """)
    #expect(store.chartSeries(["a", "b"]) == [ChartSeries(id: "b", index: 1, name: "In store", values: [900, 1100])])
    #expect(store.chartSlices(["web", "app"]) == [ChartSlice(id: "web", index: 0, name: "Website", value: 52)])
    let us = Locale(identifier: "en_US")
    #expect(Format.chartValue(1500, format: "currency", currency: "EUR", locale: us) == "€1,500.00")
    #expect(Format.chartValue(62, format: "percent", currency: nil, locale: us) == "62%")
    #expect(Format.chartTick(20000, format: "currency", currency: nil, locale: us) == "$20K")
    #expect(Format.share(31, of: 124, locale: us) == "25%")
  }

  @Test("ratings are kept within 0…max and read as \"Rated x out of max\"")
  func ratings() {
    let us = Locale(identifier: "en_US")
    #expect(Format.rating(.number(4.96), max: nil, locale: us).label == "Rated 4.96 out of 5")
    #expect(Format.rating(.number(4.96), max: nil, locale: us).filled == 5)
    #expect(Format.rating(.number(9), max: nil, locale: us).label == "Rated 5 out of 5")
    #expect(Format.rating(.number(-2), max: 10, locale: us).label == "Rated 0 out of 10")
    #expect(Format.rating(.text("3.5"), max: nil, locale: us).value == 3.5)
    #expect(Format.rating(.text("lots"), max: nil, locale: us).value == 0)
  }

  @Test("date-only values convert to and from a day in UTC; impossible dates are rejected")
  func dates() {
    guard let day = Format.utcDay("2026-10-14") else { Testing.Issue.record("valid date rejected"); return }
    #expect(Format.isoDay(day) == "2026-10-14")
    #expect(Format.utcDay("2026-02-30") == nil)
    #expect(Format.utcDay("14/10/2026") == nil)
  }
}
