// Text formats, ratings and dates, matching the web renderer (packages/react/src/catalog/components.tsx).
package dev.omniir.runtime

import dev.omniir.core.Primitive
import dev.omniir.core.isIsoDate
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.FormatStyle
import java.util.Currency
import java.util.Locale

public object Format {
  /**
   * A Text's content: money for `format="currency"` with a number, a calendar date for
   * `format="date"`, and otherwise the value as text.
   */
  public fun text(value: Primitive?, format: String?, currency: String?, locale: Locale, zone: ZoneId = ZoneId.systemDefault()): String {
    if (value == null) return ""
    if (format == "currency" && value is Primitive.Number) {
      return try {
        NumberFormat.getCurrencyInstance(locale).apply { this.currency = Currency.getInstance(currency ?: "USD") }.format(value.value)
      } catch (e: IllegalArgumentException) {
        displayText(value)
      }
    }
    if (format == "date" && value is Primitive.Text) {
      // A date-only value ("2026-09-30") is that calendar day everywhere: no time zone is applied.
      day(value.value)?.let { return mediumDate(locale).format(it) }
      instant(value.value)?.let { return mediumDate(locale).format(it.atZone(zone).toLocalDate()) }
      return value.value
    }
    return displayText(value)
  }

  /** A Rating, kept within 0…max. */
  public data class RatingModel(
    val value: Double,
    val max: Int,
    /** Whole stars to fill. */
    val filled: Int,
    /** The value as shown, with at most two decimals. */
    val shown: String,
  ) {
    /** What assistive technology reads: "Rated 4.96 out of 5". */
    val label: String get() = "Rated $shown out of $max"
  }

  public fun rating(value: Primitive?, max: Int?, locale: Locale): RatingModel {
    val top = maxOf(1, max ?: 5)
    val raw = when (value) {
      is Primitive.Number -> value.value
      is Primitive.Text -> value.value.trim().let { if (it.isEmpty()) 0.0 else it.toDoubleOrNull() ?: Double.NaN }
      is Primitive.Bool -> if (value.value) 1.0 else 0.0
      else -> 0.0
    }
    val clamped = if (raw.isFinite()) raw.coerceIn(0.0, top.toDouble()) else 0.0
    val shown = NumberFormat.getNumberInstance(locale).apply {
      maximumFractionDigits = 2
      isGroupingUsed = false
    }.format(clamped)
    return RatingModel(clamped, top, Math.round(clamped).toInt(), shown)
  }

  /** "YYYY-MM-DD" as that calendar day, or null if it isn't a real date. */
  public fun day(s: String): LocalDate? =
    if (!isIsoDate(s)) null else try { LocalDate.parse(s) } catch (e: DateTimeParseException) { null }

  /** A full ISO 8601 timestamp, such as "2026-09-30T14:05:00Z". */
  public fun instant(s: String): Instant? =
    try { OffsetDateTime.parse(s).toInstant() } catch (e: DateTimeParseException) { null }

  private fun mediumDate(locale: Locale): DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale)
}
