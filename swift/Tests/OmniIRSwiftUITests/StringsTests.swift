// The renderer's own words (PLAN-THEMES.md D.2): placeholders filled in one plain pass, never through
// formatting functions, so an app's wording (even built from user input) can't be interpreted or expand twice.
import Foundation
import Testing
@testable import OmniIRSwiftUI

@Suite("Renderer words")
struct StringsTests {
  @Test("placeholders are filled in one pass; a value's own braces are never expanded")
  func onePass() {
    #expect(fillTemplate("Rated {value} out of {max}", ["value": "{max}", "max": "5"]) == "Rated {max} out of 5")
    #expect(fillTemplate("{a}{b}", ["a": "{b}", "b": "B"]) == "{b}B")
  }

  @Test("format codes, unknown placeholders and stray braces stay as written")
  func literal() {
    #expect(fillTemplate("%@ %d %s %n %1$s {unknown} {{x}} {value}", ["value": "3"]) == "%@ %d %s %n %1$s {unknown} {{x}} 3")
  }

  @Test("English by default, and a rating reads in the app's words")
  func english() {
    #expect(OmniStrings.english.loading == "Loading")
    let model = Format.rating(.number(4.5), max: nil, locale: Locale(identifier: "en_US"))
    #expect(model.label() == "Rated 4.5 out of 5")
    #expect(model.label(OmniStrings(rating: "Noté {value} sur {max}").rating) == "Noté 4.5 sur 5")
  }
}
