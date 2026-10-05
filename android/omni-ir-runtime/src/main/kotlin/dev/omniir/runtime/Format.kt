// Text formats, ratings and dates, matching the web renderer (packages/react/src/catalog/components.tsx).
package dev.omniir.runtime

import dev.omniir.core.Primitive
import dev.omniir.core.PropValue
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

  /** A Table's column headings or a TableRow's cells as text; anything else is an empty list. */
  public fun texts(value: PropValue?): List<String> =
    (value as? PropValue.ListOf)?.items?.map { (it as? PropValue.Text)?.value ?: "" } ?: emptyList()

  /** A table cell: numbers are aligned to the end of their column. */
  public data class Cell(val text: String, val isNumber: Boolean)

  /** A TableRow's cells: text as is, numbers in the viewer's locale. */
  public fun cells(value: PropValue?, locale: Locale): List<Cell> =
    (value as? PropValue.ListOf)?.items?.map {
      when (it) {
        is PropValue.Number -> Cell(NumberFormat.getNumberInstance(locale).format(it.value), true)
        is PropValue.Text -> Cell(it.value, false)
        else -> Cell("", false)
      }
    } ?: emptyList()

  /** A chart value in its `format`: a number, money, or a percentage (62 means 62%). */
  public fun chartValue(value: Double, format: String?, currency: String?, locale: Locale): String = when (format) {
    "currency" -> try {
      NumberFormat.getCurrencyInstance(locale).apply { this.currency = Currency.getInstance(currency ?: "USD") }.format(value)
    } catch (e: IllegalArgumentException) {
      NumberFormat.getNumberInstance(locale).format(value)
    }
    "percent" -> NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = 1 }.format(value) + "%"
    else -> NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = 2 }.format(value)
  }

  /** An axis tick, written short: $20K rather than $20,000.00. */
  public fun chartTick(value: Double, format: String?, currency: String?, locale: Locale): String {
    // Android's java.text has no compact number format (desktop Java 12+ does), so it's done here:
    // thousands, millions and billions as K, M and B, with at most one decimal.
    val magnitude = kotlin.math.abs(value)
    val (scaled, suffix) = when {
      magnitude >= 1e9 -> value / 1e9 to "B"
      magnitude >= 1e6 -> value / 1e6 to "M"
      magnitude >= 1e3 -> value / 1e3 to "K"
      else -> value to ""
    }
    val compact = NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = 1 }.format(scaled) + suffix
    return when (format) {
      "currency" -> (try { Currency.getInstance(currency ?: "USD").getSymbol(locale) } catch (e: IllegalArgumentException) { "" }) + compact
      "percent" -> "$compact%"
      else -> compact
    }
  }

  /** A slice's share of the whole, as shown in the legend: "52%". */
  public fun share(value: Double, total: Double, locale: Locale): String =
    NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = 1 }.format(if (total > 0) value / total * 100 else 0.0) + "%"

  /** Round axis ticks from the lowest to the highest value, including 0 (as the web renderer draws them). */
  public fun niceTicks(min: Double, max: Double, count: Int = 4): List<Double> {
    val lo = minOf(0.0, min)
    val hi = maxOf(0.0, max)
    if (hi == lo) return listOf(lo, lo + 1)
    val raw = (hi - lo) / count
    val mag = Math.pow(10.0, Math.floor(Math.log10(raw)))
    val step = listOf(1.0, 2.0, 2.5, 5.0, 10.0).map { it * mag }.firstOrNull { it >= raw } ?: (10 * mag)
    val ticks = mutableListOf<Double>()
    var t = Math.floor(lo / step) * step
    while (t < hi + step - 1e-9) {
      ticks += Math.round(t / step) * step
      t += step
    }
    if (ticks.last() < hi) ticks += ticks.last() + step
    return ticks
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
