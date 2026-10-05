// The renderer's model: what each node resolves to, governance, actions and formats.
// Port of swift/Tests/OmniIRSwiftUITests/OmniStoreTests.swift.
package dev.omniir.runtime

import dev.omniir.core.IssueCode
import dev.omniir.core.Primitive
import dev.omniir.core.Tool
import dev.omniir.core.ToolRegistry
import kotlinx.coroutines.test.runTest
import java.util.Locale
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull

private val tools: ToolRegistry = mapOf(
  "payments.confirm" to Tool { params ->
    val amount = (params["amount"] as? Primitive.Number)?.value
    if (amount != null && amount > 0) emptyList() else listOf("amount: must be more than 0")
  },
  "bookings.reserve" to Tool.acceptsAnything,
)

private const val PAYMENT = """root = Card([title, amountField, pay, cancel])
title = Heading("Confirm payment")
${'$'}amount = 42.5
amountField = Text(${'$'}amount, format="currency")
pay = Button("Pay", action="pay")
payM = McpMutation(pay, tool="payments.confirm", params={amount: ${'$'}amount, note: "Table 4"})
cancel = Button("Cancel", variant="secondary")
"""

class OmniStoreTest {
  @Test
  fun `slots - a node once it arrives, a placeholder before, a fallback if it never does`() {
    val store = OmniStore(tools)
    store.write("root = Card([title, gone])\n")
    assertEquals(Slot.Pending, store.slot("title"))
    store.write("title = Heading(\"Hi\")\n")
    val title = assertIs<Slot.Node>(store.slot("title")).node
    assertEquals("Hi", store.text(title.props["text"]))
    store.end()
    assertEquals(Slot.Missing, store.slot("gone"))
  }

  @Test
  fun `state props show the current value, and edits update every use`() {
    val store = OmniStore(tools)
    store.write("root = Stack([f, echo])\n\$note = \"\"\nf = Input(\$note, label=\"Note\")\necho = Text(\$note)\n")
    store.setState("\$note", Primitive.Text("hello"))
    val echo = assertIs<Slot.Node>(store.slot("echo")).node
    assertEquals("hello", store.text(echo.props["text"]))
    assertEquals("hello", store.stateText("\$note"))
  }

  @Test
  fun `a governed Button is disabled until its McpMutation arrives, then sends resolved params`() = runTest {
    val store = OmniStore(tools)
    val (before, after) = PAYMENT.split("payM =")
    store.write(before)
    assertEquals(Governance.Ungoverned, store.governance("pay"))
    store.write("payM =$after")
    store.end()
    assertEquals(Governance.Ready("payments.confirm"), store.governance("pay"))

    val calls = mutableListOf<MutationCall>()
    val events = mutableListOf<RendererEvent>()
    store.press("pay", { calls += it }, { events += it })
    assertEquals(
      listOf(MutationCall("payM", "pay", "payments.confirm", mapOf("amount" to Primitive.Number(42.5), "note" to Primitive.Text("Table 4")))),
      calls,
    )
    assertEquals(emptyList(), events)
  }

  @Test
  fun `params that fail the tool's check block the Button until a value it used changes`() = runTest {
    val store = OmniStore(tools)
    store.write(PAYMENT.replace("\$amount = 42.5", "\$amount = 0"))
    store.end()
    var calls = 0
    val events = mutableListOf<RendererEvent>()
    store.press("pay", { calls++ }, { events += it })
    assertEquals(0, calls)
    assertEquals(listOf(IssueCode.MUTATION_BLOCKED), events.map { assertIs<RendererEvent.Error>(it).issue.code })
    assertEquals(Governance.Blocked("payments.confirm", "amount: must be more than 0"), store.governance("pay"))
    store.setState("\$amount", Primitive.Number(5.0))
    assertEquals(Governance.Ready("payments.confirm"), store.governance("pay"))
  }

  @Test
  fun `a failing handler is reported, and a Button without an action only reports the press`() = runTest {
    val store = OmniStore(tools)
    store.write(PAYMENT)
    store.end()
    val events = mutableListOf<RendererEvent>()
    store.press("pay", { throw IllegalStateException("refused") }, { events += it })
    store.press("cancel", { error("cancel must never reach the backend") }, { events += it })
    assertEquals(2, events.size)
    val failed = assertIs<RendererEvent.Error>(events[0]).issue
    assertEquals(IssueCode.HANDLER_FAILED, failed.code)
    assertEquals("pay", failed.id)
    assertEquals(RendererEvent.Press("cancel"), events[1])
    assertFalse(store.isRunning("pay"))
  }
}

class FormatTest {
  private val us = Locale.US

  @Test
  fun `text formats - currency, a date-only value on its own day everywhere, other text as is`() {
    assertEquals("$42.50", Format.text(Primitive.Number(42.5), "currency", null, us))
    assertEquals("€1,200.00", Format.text(Primitive.Number(1200.0), "currency", "EUR", us))
    for (zone in listOf("America/Los_Angeles", "UTC", "Pacific/Kiritimati")) {
      assertEquals("Sep 30, 2026", Format.text(Primitive.Text("2026-09-30"), "date", null, us, java.time.ZoneId.of(zone)), zone)
    }
    assertEquals("next Tuesday", Format.text(Primitive.Text("next Tuesday"), "date", null, us))
    assertEquals("4", Format.text(Primitive.Number(4.0), null, null, us))
    assertEquals("4.96", Format.text(Primitive.Number(4.96), null, null, us))
    assertEquals("true", Format.text(Primitive.Bool(true), null, null, us))
    assertEquals("", Format.text(Primitive.Null, null, null, us))
  }

  @Test
  fun `ratings are kept within 0 to max and read as Rated x out of max`() {
    assertEquals("Rated 4.96 out of 5", Format.rating(Primitive.Number(4.96), null, us).label)
    assertEquals(5, Format.rating(Primitive.Number(4.96), null, us).filled)
    assertEquals("Rated 5 out of 5", Format.rating(Primitive.Number(9.0), null, us).label)
    assertEquals("Rated 0 out of 10", Format.rating(Primitive.Number(-2.0), 10, us).label)
    assertEquals(3.5, Format.rating(Primitive.Text("3.5"), null, us).value)
    assertEquals(0.0, Format.rating(Primitive.Text("lots"), null, us).value)
  }

  @Test
  fun `impossible dates are rejected`() {
    assertEquals("2026-10-14", Format.day("2026-10-14").toString())
    assertNull(Format.day("2026-02-30"))
    assertNull(Format.day("14/10/2026"))
  }

  @Test
  fun `Select shows its option or nothing chosen, Switch reads true only for true, edits update state`() {
    val store = OmniStore(tools)
    store.write(
      """root = Stack([s, w])
${'$'}size = "XL"
s = Select(${'$'}size, label="Size", options=["S", "M"])
${'$'}news = false
w = Switch(${'$'}news, label="News")
""",
    )
    assertEquals("", store.chosenOption("\$size", listOf("S", "M")))
    store.setState("\$size", Primitive.Text("M"))
    assertEquals("M", store.chosenOption("\$size", listOf("S", "M")))
    assertFalse(store.stateBool("\$news"))
    store.setState("\$news", Primitive.Bool(true))
    assertEquals(true, store.stateBool("\$news"))
  }

  @Test
  fun `a table's headings and cells with numbers marked, and Tabs' labels as their lines arrive`() {
    val store = OmniStore(tools)
    store.write(
      """root = Stack([t, tabs])
t = Table(["Plan", "Projects"], [r])
r = TableRow(["Pro", 1200])
tabs = Tabs([a, b])
a = Tab("Profile", [])
""",
    )
    val table = assertIs<Slot.Node>(store.slot("t")).node
    val row = assertIs<Slot.Node>(store.slot("r")).node
    assertEquals(listOf("Plan", "Projects"), Format.texts(table.props["columns"]))
    assertEquals(listOf(Format.Cell("Pro", false), Format.Cell("1,200", true)), Format.cells(row.props["cells"], us))
    assertEquals(listOf("Profile", null), store.tabLabels(listOf("a", "b")))
    store.write("b = Tab(\"Alerts\", [])\n")
    assertEquals(listOf("Profile", "Alerts"), store.tabLabels(listOf("a", "b")))
  }

  @Test
  fun `charts - series and slices as they arrive keeping their places, values, ticks and shares in the chart's format`() {
    val store = OmniStore(tools)
    store.write(
      """root = Stack([sales, pie])
sales = BarChart("Sales", ["Jul", "Aug"], [a, b], format="currency")
b = Series("In store", [900, 1100])
pie = PieChart("Channels", [web, app])
web = Slice("Website", 52)
""",
    )
    assertEquals(listOf(ChartSeries("b", 1, "In store", listOf(900.0, 1100.0))), store.chartSeries(listOf("a", "b")))
    assertEquals(listOf(ChartSlice("web", 0, "Website", 52.0)), store.chartSlices(listOf("web", "app")))
    assertEquals("€1,500.00", Format.chartValue(1500.0, "currency", "EUR", us))
    assertEquals("62%", Format.chartValue(62.0, "percent", null, us))
    assertEquals("$20K", Format.chartTick(20000.0, "currency", null, us))
    assertEquals("25%", Format.share(31.0, 124.0, us))
    assertEquals(listOf(0.0, 500.0, 1000.0, 1500.0, 2000.0), Format.niceTicks(900.0, 1800.0))
  }
}
