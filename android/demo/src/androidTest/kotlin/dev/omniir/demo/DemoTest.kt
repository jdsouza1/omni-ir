// UI tests for the demo app on an emulator: governance end to end, and (when CI passes a server URL)
// a screen streamed from the repo's Express server with a governed action sent back to it.
package dev.omniir.demo

import android.content.Intent
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DemoTest {
  @get:Rule val compose = createEmptyComposeRule()

  private fun launch(vararg extras: Pair<String, String>): ActivityScenario<MainActivity> =
    ActivityScenario.launch(
      Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java).apply {
        for ((key, value) in extras) putExtra(key, value)
      },
    )

  private fun waitUntilDone(timeoutMillis: Long = 30_000) {
    compose.waitUntil(timeoutMillis) { compose.onAllNodes(hasText("Done")).fetchSemanticsNodes().isNotEmpty() }
  }

  private fun waitForText(text: String, timeoutMillis: Long = 10_000) {
    compose.waitUntil(timeoutMillis) { compose.onAllNodes(hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty() }
  }

  /** The booking screen streams in; Reserve is enabled once its McpMutation arrives, and reaches the handler. */
  @Test
  fun streamThenReserve() {
    launch("fixture" to "landing/booking", "appearance" to "light")
    waitUntilDone()
    compose.onNodeWithText("Reserve · \$642").performScrollTo().assertIsEnabled().performClick()
    waitForText("Sent bookings.reserve")
  }

  /** A Button whose McpMutation never arrives stays disabled; one without an action is never governed. */
  @Test
  fun ungovernedButtonStaysDisabled() {
    launch("fixture" to "variants/missing-mutation", "instant" to "true")
    waitUntilDone()
    compose.onNodeWithText("Pay now").assertIsNotEnabled()
    compose.onNodeWithText("Cancel").assertIsEnabled()
  }

  /** Charts draw, and each is read to TalkBack as its title followed by its values. */
  @Test
  fun chartsDraw() {
    for ((fixture, title) in listOf("sales-dashboard" to "Sales by month", "sales-dashboard" to "Weekly visitors", "order-breakdown" to "Share of 1,240 orders")) {
      launch("fixture" to fixture, "instant" to "true").use {
        waitUntilDone()
        compose.waitUntil(10_000) { compose.onAllNodes(hasContentDescription(title, substring = true)).fetchSemanticsNodes().isNotEmpty() }
      }
    }
  }

  /** End to end with the Express server (free mock model), when CI passes its URL. */
  @Test
  fun streamFromServerThenReserve() {
    val server = InstrumentationRegistry.getArguments().getString("server")
    assumeTrue("no server URL given", server != null)
    launch("server" to (server ?: ""), "prompt" to "book a stay", "appearance" to "light")
    waitUntilDone(60_000)
    compose.onNodeWithText("Reserve · \$642").performScrollTo().assertIsEnabled().performClick()
    waitForText("bookingId")
  }
}
