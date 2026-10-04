// The demo's tools and fixtures, mirroring the web app's (app/tools.ts) and the repo's fixtures/ folder.
package dev.omniir.demo

import android.content.Context
import dev.omniir.core.Primitive
import dev.omniir.core.Tool
import dev.omniir.core.ToolRegistry
import dev.omniir.core.isIsoDate

object DemoTools {
  val registry: ToolRegistry = mapOf(
    "payments.confirm" to Tool { p ->
      problems(
        rule((number(p["amount"]) ?: 0.0) > 0, "amount: must be a number above 0"),
        rule((text(p["note"])?.length ?: Int.MAX_VALUE) <= 500, "note: must be text up to 500 characters"),
      )
    },
    "auth.sendMagicLink" to Tool { p ->
      problems(rule(text(p["email"])?.let { "@" in it && "." in it } == true, "email: must be an email address"))
    },
    "profile.update" to Tool { p ->
      problems(
        rule(trimmed(p["displayName"])?.length in 1..60, "displayName: 1 to 60 characters"),
        rule((text(p["bio"])?.length ?: Int.MAX_VALUE) <= 160, "bio: up to 160 characters"),
      )
    },
    "orders.requestReturn" to Tool { p ->
      problems(rule(text(p["orderId"])?.matches(Regex("[A-Z0-9-]{4,32}")) == true, "orderId: not a valid order number"))
    },
    "support.createTicket" to Tool { p ->
      problems(
        rule(trimmed(p["subject"])?.length in 1..120, "subject: 1 to 120 characters"),
        rule(trimmed(p["message"])?.length in 1..2000, "message: 1 to 2000 characters"),
      )
    },
    "bookings.reserve" to Tool { p ->
      val checkIn = text(p["checkIn"])
      val checkOut = text(p["checkOut"])
      when {
        checkIn == null || checkOut == null || !isIsoDate(checkIn) || !isIsoDate(checkOut) -> listOf("checkIn and checkOut: dates written YYYY-MM-DD")
        checkOut <= checkIn -> listOf("checkOut: must be after checkIn")
        else -> emptyList()
      }
    },
    "assistant.ask" to Tool { p -> problems(rule(trimmed(p["question"])?.length in 1..500, "question: 1 to 500 characters")) },
    "settings.update" to Tool { p ->
      problems(
        rule(trimmed(p["language"])?.length in 1..40, "language: 1 to 40 characters"),
        rule(p["orderUpdates"] is Primitive.Bool, "orderUpdates: must be true or false"),
        rule(p["promotions"] is Primitive.Bool, "promotions: must be true or false"),
      )
    },
  )

  private fun rule(ok: Boolean, problem: String): String? = if (ok) null else problem

  private fun problems(vararg results: String?): List<String> = results.filterNotNull()

  private fun text(value: Primitive?) = (value as? Primitive.Text)?.value

  private fun number(value: Primitive?) = (value as? Primitive.Number)?.value

  private fun trimmed(value: Primitive?) = text(value)?.trim()
}

/** The repo's fixtures/ folder, bundled as assets/fixtures by the build. */
object Fixtures {
  private val groups = listOf("" to "Screens", "landing" to "Landing page examples", "variants" to "Failure demos")

  /** Every fixture id, such as "payment-confirmation" or "landing/booking". */
  fun list(context: Context): List<String> = groups.flatMap { (folder, _) ->
    val dir = if (folder.isEmpty()) "fixtures" else "fixtures/$folder"
    (context.assets.list(dir) ?: emptyArray()).filter { it.endsWith(".omni") }.sorted()
      .map { if (folder.isEmpty()) it.removeSuffix(".omni") else "$folder/${it.removeSuffix(".omni")}" }
  }

  fun grouped(ids: List<String>): List<Pair<String, List<String>>> = groups.map { (folder, title) ->
    title to ids.filter { if (folder.isEmpty()) '/' !in it else it.startsWith("$folder/") }
  }

  fun read(context: Context, id: String): String =
    runCatching { context.assets.open("fixtures/$id.omni").use { String(it.readBytes(), Charsets.UTF_8) } }.getOrDefault("")

  fun title(id: String): String = id.substringAfter('/').split('-').joinToString(" ") { word -> word.replaceFirstChar { it.uppercase() } }
}
