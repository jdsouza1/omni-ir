// UI tests for the demo app. They take the screenshots the owner reviews (light and dark, normal and
// large text) and check a governed action end to end. CI records the simulator during
// StreamingTests, so the recording shows a screen streaming in.
import XCTest

private func launch(_ fixture: String, appearance: String = "light", instant: Bool = true, largeText: Bool = false) -> XCUIApplication {
  let app = XCUIApplication()
  app.launchArguments = ["-fixture", fixture, "-appearance", appearance, "-instant", instant ? "YES" : "NO"]
  if largeText { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityL"] }
  app.launch()
  return app
}

private func waitUntilDone(_ app: XCUIApplication, _ test: XCTestCase, timeout: TimeInterval = 30) {
  let status = app.staticTexts.matching(identifier: "status").firstMatch
  let done = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", "Done"), object: status)
  XCTAssertEqual(XCTWaiter().wait(for: [done], timeout: timeout), .completed, "the screen never finished streaming")
}

final class ScreenshotTests: XCTestCase {
  private let screens = [
    "landing/booking", "landing/checkout", "landing/assistant",
    "payment-confirmation", "sign-in", "order-status", "profile-settings", "support-contact",
    "account-settings", "order-history",
  ]

  func testScreenshots() {
    for appearance in ["light", "dark"] {
      for screen in screens { shoot(screen, appearance: appearance) }
    }
    for screen in ["landing/booking", "payment-confirmation"] { shoot(screen, appearance: "light", largeText: true) }
    for screen in ["variants/dangling-child", "variants/unknown-tool"] { shoot(screen, appearance: "light") }
  }

  private func shoot(_ screen: String, appearance: String, largeText: Bool = false) {
    let app = launch(screen, appearance: appearance, largeText: largeText)
    waitUntilDone(app, self)
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = screen.replacingOccurrences(of: "/", with: "-") + "-" + appearance + (largeText ? "-large-text" : "")
    attachment.lifetime = .keepAlways
    add(attachment)
    app.terminate()
  }
}

final class StreamingTests: XCTestCase {
  /// Streams the booking screen, changes nothing, and reserves: the governed action reaches the handler.
  func testStreamThenReserve() {
    let app = launch("landing/booking", instant: false)
    waitUntilDone(app, self)
    let reserve = app.buttons["Reserve · $642"]
    XCTAssertTrue(reserve.waitForExistence(timeout: 5))
    XCTAssertTrue(reserve.isEnabled, "a governed button is enabled once its McpMutation arrives")
    reserve.tap()
    let sent = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Sent bookings.reserve")).firstMatch
    XCTAssertTrue(sent.waitForExistence(timeout: 5), "the action reached the app's handler")
    Thread.sleep(forTimeInterval: 2)  // leave the result on screen for the recording
  }

  /// A Button whose McpMutation never arrives stays disabled.
  func testUngovernedButtonStaysDisabled() {
    let app = launch("variants/missing-mutation")
    waitUntilDone(app, self)
    let pay = app.buttons["Pay now"]
    XCTAssertTrue(pay.waitForExistence(timeout: 5))
    XCTAssertFalse(pay.isEnabled, "an action button without an McpMutation stays disabled")
    XCTAssertTrue(app.buttons["Cancel"].isEnabled, "a button without an action is never governed")
  }
}

/// End to end with the repo's Express server (started by the workflow with the free mock model):
/// the Swift client streams a screen over server-sent events, and a governed action goes to /api/mutate.
final class ServerTests: XCTestCase {
  func testStreamFromServerThenReserve() {
    let app = XCUIApplication()
    app.launchArguments = ["-server", "http://localhost:8787", "-prompt", "book a stay", "-appearance", "light"]
    app.launch()
    waitUntilDone(app, self, timeout: 60)
    let reserve = app.buttons["Reserve · $642"]
    XCTAssertTrue(reserve.waitForExistence(timeout: 5), "the server's booking screen arrived")
    reserve.tap()
    let result = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "bookingId")).firstMatch
    XCTAssertTrue(result.waitForExistence(timeout: 10), "the server ran the action and returned its result")
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "server-booking-after-reserve"
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
