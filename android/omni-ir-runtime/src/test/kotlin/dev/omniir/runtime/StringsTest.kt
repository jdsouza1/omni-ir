// The renderer's own words (PLAN-THEMES.md D.2): placeholders filled in one plain pass, never through
// formatting functions, so an app's wording (even built from user input) can't crash the app or expand twice.
package dev.omniir.runtime

import dev.omniir.core.Primitive
import java.util.Locale
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class StringsTest {
  @Test
  fun `placeholders are filled in one pass, and a value's own braces are never expanded`() {
    assertEquals("Rated {max} out of 5", fillTemplate("Rated {value} out of {max}", mapOf("value" to "{max}", "max" to "5")))
    assertEquals("{b}B", fillTemplate("{a}{b}", mapOf("a" to "{b}", "b" to "B")))
  }

  @Test
  fun `format codes, unknown placeholders and stray braces stay as written`() {
    assertEquals("%@ %d %s %n %1\$s {unknown} {{x}} 3", fillTemplate("%@ %d %s %n %1\$s {unknown} {{x}} {value}", mapOf("value" to "3")))
  }

  @Test
  fun `English by default, and a rating reads in the app's words`() {
    assertEquals("Loading", OmniStrings().loading)
    val model = Format.rating(Primitive.Number(4.5), null, Locale.US)
    assertEquals("Rated 4.5 out of 5", model.label())
    assertEquals("Noté 4.5 sur 5", model.label(OmniStrings(rating = "Noté {value} sur {max}").rating))
  }
}
