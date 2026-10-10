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
    "account-settings", "order-history", "sales-dashboard", "order-breakdown",
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

/// Fields and confirmations (SPEC.md sections 8 and 9), with screenshots for the review page.
final class FormTests: XCTestCase {
  private func shot(_ app: XCUIApplication, _ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  /// A field its action reads blocks the press until it passes, with its message shown ([8.6]).
  func testFieldBlocksThenSends() {
    let app = launch("sign-in")
    waitUntilDone(app, self)
    let send = app.buttons["Email me a link"]
    XCTAssertTrue(send.waitForExistence(timeout: 5))
    send.tap()
    XCTAssertTrue(app.staticTexts["This is required."].waitForExistence(timeout: 5), "the message shows on press")
    shot(app, "forms-sign-in-required")
    let email = app.textFields.firstMatch
    email.tap()
    email.typeText("ann@")
    send.tap()
    XCTAssertTrue(app.staticTexts["Enter an email address, like name@example.com."].waitForExistence(timeout: 5))
    shot(app, "forms-sign-in-invalid-email")
    email.tap()
    email.typeText("example.com")
    send.tap()
    let sent = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Sent auth.sendMagicLink")).firstMatch
    XCTAssertTrue(sent.waitForExistence(timeout: 5), "once the field passes, the action reaches the handler")
  }

  /// The app's confirmation: Cancel sends nothing, Confirm sends ([9.1]).
  func testConfirmationBeforePaying() {
    let app = launch("payment-confirmation")
    waitUntilDone(app, self)
    let pay = app.buttons["Pay now"]
    XCTAssertTrue(pay.waitForExistence(timeout: 5))
    pay.tap()
    let alert = app.alerts["Pay 42.5 USD?"]
    XCTAssertTrue(alert.waitForExistence(timeout: 5), "the app's sentence, filled with the amount")
    shot(app, "forms-confirmation")
    alert.buttons["Cancel"].tap()
    let sent = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Sent payments.confirm")).firstMatch
    XCTAssertFalse(sent.waitForExistence(timeout: 2), "cancel sends nothing")
    pay.tap()
    XCTAssertTrue(alert.waitForExistence(timeout: 5))
    alert.buttons["Confirm"].tap()
    XCTAssertTrue(sent.waitForExistence(timeout: 5), "confirm sends")
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
