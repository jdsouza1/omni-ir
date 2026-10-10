// Fields and confirmations in the store (SPEC.md section 8, Fields, [8.5]–[8.6]; section 9,
// Confirmations, [9.1]–[9.3]). Port of tests/renderer.forms.test.tsx; the field rules themselves are
// covered by the shared cases in omni-ir-core's FieldsConformanceTest.
package dev.omniir.runtime

import dev.omniir.core.FieldProblem
import dev.omniir.core.IssueCode
import dev.omniir.core.Primitive
import dev.omniir.core.Tool
import dev.omniir.core.ToolRegistry
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val tools: ToolRegistry = mapOf(
  "support.createTicket" to Tool { params ->
    if ((params["subject"] as? Primitive.Text)?.value.isNullOrEmpty()) listOf("subject: required") else emptyList()
  },
  "payments.confirm" to Tool.acceptsAnything,
)

private const val TICKET = """root = Card([email, search, subject, send])
${'$'}email = ""
email = Input(${'$'}email, label="Email", required=true, format="email")
${'$'}q = ""
search = Input(${'$'}q, label="Search", required=true)
${'$'}subject = ""
subject = Input(${'$'}subject, label="Subject", maxLength=10)
send = Button("Send", action="go")
go = McpMutation(send, tool="support.createTicket", params={email: ${'$'}email, subject: ${'$'}subject})
"""

private const val PAYMENT = """root = Card([pay])
${'$'}amount = 42.5
pay = Button("Pay", action="payM")
payM = McpMutation(pay, tool="payments.confirm", params={amount: ${'$'}amount, note: "{amount}"})
"""

class FormsTest {
  @Test
  fun `a message shows only once the person leaves the field, and stays until it passes`() {
    val store = OmniStore(tools)
    store.write(TICKET)
    assertEquals(FieldProblem("required"), store.fieldProblem("email"))
    assertNull(store.visibleFieldProblem("email"), "not before the person has left the field")
    store.showField("email")
    assertEquals(FieldProblem("required"), store.visibleFieldProblem("email"))
    store.setState("\$email", Primitive.Text("ann@"))
    assertEquals(FieldProblem("invalidEmail"), store.visibleFieldProblem("email"))
    store.setState("\$email", Primitive.Text("ann@example.com"))
    assertNull(store.visibleFieldProblem("email"))
    assertNull(store.fieldProblem("send"), "only fields have problems")
  }

  @Test
  fun `a press checks the fields its params read first - they show, focus goes to the first, nothing runs`() = runTest {
    val store = OmniStore(tools)
    store.write(TICKET)
    store.setState("\$subject", Primitive.Text("far too long a subject"))
    val sent = mutableListOf<MutationCall>()
    val events = mutableListOf<RendererEvent>()
    val focus = store.press("send", { sent += it }, { events += it })
    assertEquals("email", focus)
    assertEquals(emptyList(), sent)
    assertEquals(emptyList(), events, "a field problem isn't a renderer error: the person can fix it")
    assertEquals(setOf("email", "subject"), store.shownFields.value, "the fields it reads, not the search box")
    assertEquals(FieldProblem("tooLong", mapOf("max" to "10")), store.visibleFieldProblem("subject"))
    assertNull(store.visibleFieldProblem("search"), "a field no params read blocks nothing")
  }

  @Test
  fun `once the fields pass, the tool's own check still runs`() = runTest {
    val store = OmniStore(tools)
    store.write(TICKET)
    store.setState("\$email", Primitive.Text("ann@example.com"))
    val events = mutableListOf<RendererEvent>()
    assertNull(store.press("send", { error("must not run") }, { events += it }))
    assertEquals(IssueCode.MUTATION_BLOCKED, assertIs<RendererEvent.Error>(events.single()).issue.code)
    store.setState("\$subject", Primitive.Text("Help"))
    val sent = mutableListOf<MutationCall>()
    store.press("send", { sent += it }, { events += it })
    assertEquals("support.createTicket", sent.single().tool)
  }

  @Test
  fun `the app's confirmation runs last, filled once with the params as plain text, and cancel sends nothing`() = runTest {
    val store = OmniStore(tools, confirm = mapOf("payments.confirm" to "Pay {amount}? ({note})"))
    store.write(PAYMENT)
    val asked = mutableListOf<String>()
    val sent = mutableListOf<MutationCall>()
    store.press("pay", { sent += it }, {}, askConfirmation = { asked += it; false })
    assertEquals(listOf("Pay 42.5? ({amount})"), asked, "a value is never read as a placeholder")
    assertEquals(emptyList(), sent)
    store.press("pay", { sent += it }, {}, askConfirmation = { true })
    assertEquals(1, sent.size)
  }

  @Test
  fun `a tool that needs confirmation never runs when the view can't ask`() = runTest {
    val store = OmniStore(tools, confirm = mapOf("payments.confirm" to "Pay {amount}?"))
    store.write(PAYMENT)
    val sent = mutableListOf<MutationCall>()
    store.press("pay", { sent += it }, {})
    assertEquals(emptyList(), sent)
    assertTrue(OmniStore(tools).let { it.write(PAYMENT); it.press("pay", { sent += it }, {}); sent.size == 1 }, "no confirmation, no question")
  }

  @Test
  fun `field messages in the renderer's words, with the app's own words when given`() {
    val english = OmniStrings()
    assertEquals("Use 10 characters or fewer.", english.field(FieldProblem("tooLong", mapOf("max" to "10"))))
    assertEquals("This is required.", english.field(FieldProblem("required")))
    assertEquals("Obligatoire", english.copy(required = "Obligatoire").field(FieldProblem("required")))
  }
}
