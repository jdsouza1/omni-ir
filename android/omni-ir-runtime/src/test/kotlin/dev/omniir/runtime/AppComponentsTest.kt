// App-defined components in the store (Step 20, PLAN-APPCOMPONENTS.md B.2): the demo app's own
// declarations, read from app/components.json as the demo app reads them, checked like the catalog's,
// with $state read for views and field checks before a press. The parser's rules themselves are
// covered by the shared conformance cases.
package dev.omniir.runtime

import dev.omniir.core.AppComponentException
import dev.omniir.core.ComponentType
import dev.omniir.core.FieldProblem
import dev.omniir.core.Primitive
import dev.omniir.core.PropValue
import dev.omniir.core.Tool
import kotlinx.coroutines.test.runTest
import java.io.File
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val repoRoot = File(System.getProperty("omniir.repoRoot") ?: "..")
private val registry = appRegistryFromJson(File(repoRoot, "app/components.json").readText())
private val tools = mapOf("cart.add" to Tool.acceptsAnything)
private val product = File(repoRoot, "fixtures/product.omni").readText()

class AppComponentsTest {
  private fun store() = OmniStore(tools, setOf("tote"), components = registry.first, pictures = registry.second)

  @Test
  fun `reads the app's declarations from JSON and refuses malformed ones`() {
    assertEquals(listOf("ProductCard", "QuantityPicker"), registry.first.names)
    assertEquals("product-", registry.second.single().prefix)
    assertThrows<AppComponentException> { appRegistryFromJson("""{"components": {"Card": {"description": "x", "props": {}}}}""") }
    assertThrows<AppComponentException> { appRegistryFromJson("[]") }
  }

  @Test
  fun `streams with app components draw without issues, and views get values, never state references`() {
    val store = store()
    store.write(product)
    store.end()
    assertEquals(emptyList(), store.issues.value)
    val doc = store.document.value
    val card = doc.nodes.getValue("card")
    assertEquals(ComponentType.APP, card.type)
    assertEquals("ProductCard", card.appName)
    assertEquals(listOf("add", "later"), card.children)
    val qty = store.appProps(doc.nodes.getValue("qty"))
    assertEquals(PropValue.Number(1.0), qty["value"])
    assertEquals(PropValue.Text("How many"), qty["label"])
    assertTrue(qty.values.none { it is PropValue.State })
  }

  @Test
  fun `an app field joins the checks before a press, and edits its state through the store`() = runTest {
    val store = store()
    store.write(product)
    store.setState("\$qty", Primitive.Null)
    val sent = mutableListOf<MutationCall>()
    assertEquals("qty", store.press("add", { sent += it }, {}))
    assertEquals(emptyList(), sent)
    assertEquals(FieldProblem("required"), store.visibleFieldProblem("qty"))
    store.setState("\$qty", Primitive.Number(2.0))
    assertNull(store.visibleFieldProblem("qty"))
    store.press("add", { sent += it }, {})
    assertEquals(mapOf("productId" to Primitive.Text("1042"), "quantity" to Primitive.Number(2.0)), sent.single().params)
  }

  @Test
  fun `without the app's declarations, its components are unknown`() {
    val store = OmniStore(tools, setOf("tote"))
    store.write(product)
    assertTrue(store.issues.value.any { it.code.wireName == "unknown_component" && it.id == "card" })
  }
}
