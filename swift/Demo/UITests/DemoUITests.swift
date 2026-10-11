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
    "account-settings", "order-history", "sales-dashboard", "order-breakdown", "product",
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
    let alert = app.alerts["Pay $42.50?"]
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

/// The app's own components (Step 20): drawn by its views; the chosen quantity reaches the action.
final class AppComponentTests: XCTestCase {
  func testProductAddsToBag() {
    let app = launch("product")
    waitUntilDone(app, self)
    let stepper = app.steppers.firstMatch
    XCTAssertTrue(stepper.waitForExistence(timeout: 5), "the QuantityPicker is drawn by the app's own view")
    stepper.buttons.element(boundBy: 1).tap()
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "app-components-product"
    attachment.lifetime = .keepAlways
    add(attachment)
    app.buttons["Add to bag"].tap()
    let sent = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Sent cart.add")).firstMatch
    XCTAssertTrue(sent.waitForExistence(timeout: 5), "the action reached the app's handler")
    XCTAssertTrue(sent.label.contains("quantity: 2"), sent.label)
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

  /// Live screens (Step 22): the server keeps the order current, and the return's result updates its Button.
  func testOrderMovesOnThenReturn() {
    let app = XCUIApplication()
    app.launchArguments = ["-server", "http://localhost:8787", "-prompt", "where is my order?", "-appearance", "light"]
    app.launch()
    waitUntilDone(app, self, timeout: 60)
    func shot(_ name: String) {
      let attachment = XCTAttachment(screenshot: app.screenshot())
      attachment.name = name
      attachment.lifetime = .keepAlways
      add(attachment)
    }
    XCTAssertTrue(app.staticTexts["Shipped"].waitForExistence(timeout: 5), "the order arrived as shipped")
    shot("live-1-shipped")
    XCTAssertTrue(app.staticTexts["Out for delivery"].waitForExistence(timeout: 20), "the server's first update arrived")
    shot("live-2-out-for-delivery")
    XCTAssertTrue(app.staticTexts["Delivered"].waitForExistence(timeout: 20), "the server's second update arrived")
    shot("live-3-delivered")
    app.buttons["Request a return"].tap()
    let done = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Return requested")).firstMatch
    XCTAssertTrue(done.waitForExistence(timeout: 10), "the action's result replaced the Button")
    shot("live-4-return-requested")
  }
}

/// The demo video's iPhone scenes (PLAN-VIDEO.md), recorded by the `video` workflow while they run.
/// Each waits for what the scene shows, then holds it long enough to read. Recording mode (`-video YES`)
/// shows only the screen.
final class VideoTests: XCTestCase {
  private func launch(_ prompt: String) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-server", "http://localhost:8787", "-prompt", prompt, "-appearance", "light", "-video", "YES"]
    app.launch()
    return app
  }

  /// Scenes 2 to 4: the order streams in, moves on by itself, and a return replaces its Button.
  func testOrderMovesOnThenReturn() {
    let app = launch("Where is my order?")
    XCTAssertTrue(app.staticTexts["Shipped"].waitForExistence(timeout: 60), "the order arrived")
    XCTAssertTrue(app.staticTexts["Delivered"].waitForExistence(timeout: 30), "the updates arrived")
    Thread.sleep(forTimeInterval: 2)
    app.buttons["Request a return"].tap()
    let done = app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "Return requested")).firstMatch
    XCTAssertTrue(done.waitForExistence(timeout: 10), "the result replaced the Button")
    Thread.sleep(forTimeInterval: 4)
  }

  /// Scene 5: a button whose action the app never allowed stays off.
  func testDeleteButtonStaysOff() {
    let app = launch("A button that deletes my account")
    let button = app.buttons["Delete my account"]
    XCTAssertTrue(button.waitForExistence(timeout: 60), "the screen arrived")
    Thread.sleep(forTimeInterval: 2)
    XCTAssertFalse(button.isEnabled, "the app never allowed this action")
    button.tap()
    Thread.sleep(forTimeInterval: 4)
  }
}
