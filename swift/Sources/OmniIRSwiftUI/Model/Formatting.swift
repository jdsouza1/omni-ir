// Text formats, ratings and dates, matching the web renderer (packages/react/src/catalog/components.tsx).
// Foundation only, so the rules are tested on every platform.
import Foundation
import OmniIRCore

enum Format {
  /// A Text's content: money for `format="currency"` with a number, a calendar date for
  /// `format="date"`, and otherwise the value as text.
  static func text(_ value: Primitive?, format: String?, currency: String?, locale: Locale) -> String {
    guard let value else { return "" }
    if format == "currency", case .number(let n) = value {
      return n.formatted(.currency(code: currency ?? "USD").locale(locale))
    }
    if format == "date", case .text(let s) = value {
      // A date-only value ("2026-09-30") is that calendar day everywhere, so it's shown in UTC.
      if let day = utcDay(s) { return mediumDate(day, timeZone: utc, locale: locale) }
      if let instant = isoInstant(s) { return mediumDate(instant, timeZone: .current, locale: locale) }
      return s
    }
    return displayText(value)
  }

  // MARK: Tables

  /// A Table's column headings or a TableRow's cells; anything else is an empty list.
  static func texts(_ value: PropValue?) -> [String] {
    guard case .list(let items)? = value else { return [] }
    return items.map { if case .text(let s) = $0 { s } else { "" } }
  }

  struct Cell: Equatable {
    let text: String
    /// Numbers are aligned to the end of their column.
    let isNumber: Bool
  }

  /// A TableRow's cells: text as is, numbers in the viewer's locale.
  static func cells(_ value: PropValue?, locale: Locale) -> [Cell] {
    guard case .list(let items)? = value else { return [] }
    return items.map { item in
      switch item {
      case .number(let n): Cell(text: n.formatted(.number.locale(locale)), isNumber: true)
      case .text(let s): Cell(text: s, isNumber: false)
      default: Cell(text: "", isNumber: false)
      }
    }
  }

  // MARK: Charts

  /// A chart value in its `format`: a number, money, or a percentage (62 means 62%).
  static func chartValue(_ value: Double, format: String?, currency: String?, locale: Locale) -> String {
    switch format {
    case "currency": value.formatted(.currency(code: currency ?? "USD").locale(locale))
    case "percent": value.formatted(.number.precision(.fractionLength(0...1)).locale(locale)) + "%"
    default: value.formatted(.number.precision(.fractionLength(0...2)).locale(locale))
    }
  }

  /// An axis tick, written short: $20K rather than $20,000.00.
  static func chartTick(_ value: Double, format: String?, currency: String?, locale: Locale) -> String {
    switch format {
    // Compact currency formatting needs macOS 15 / iOS 18, so the symbol and a compact number are joined.
    case "currency": currencySymbol(currency ?? "USD", locale: locale) + value.formatted(.number.notation(.compactName).precision(.fractionLength(0...1)).locale(locale))
    case "percent": value.formatted(.number.notation(.compactName).precision(.fractionLength(0...1)).locale(locale)) + "%"
    default: value.formatted(.number.notation(.compactName).precision(.fractionLength(0...1)).locale(locale))
    }
  }

  /// A currency's symbol in this locale ("$" for USD in en_US), or its code if there is none.
  static func currencySymbol(_ code: String, locale: Locale) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.locale = locale
    formatter.currencyCode = code
    return formatter.currencySymbol ?? code
  }

  /// A slice's share of the whole, as shown in the legend: "52%".
  static func share(_ value: Double, of total: Double, locale: Locale) -> String {
    let percent = total > 0 ? value / total * 100 : 0
    return percent.formatted(.number.precision(.fractionLength(0...1)).locale(locale)) + "%"
  }

  // MARK: Rating

  struct RatingModel: Equatable {
    /// The value, kept within 0…max.
    let value: Double
    let max: Int
    /// Whole stars to fill.
    let filled: Int
    /// The value as shown, with at most two decimals.
    let shown: String
    /// What assistive technology reads: "Rated 4.96 out of 5".
    var label: String { "Rated \(shown) out of \(max)" }
  }

  static func rating(_ value: Primitive?, max: Int?, locale: Locale) -> RatingModel {
    let max = Swift.max(1, max ?? 5)
    let raw: Double = switch value {
    case .number(let n)?: n
    case .text(let s)?: Double(s.trimmingCharacters(in: .whitespaces)) ?? (s.trimmingCharacters(in: .whitespaces).isEmpty ? 0 : .nan)
    case .bool(let b)?: b ? 1 : 0
    default: 0
    }
    let value = raw.isFinite ? Swift.min(Swift.max(raw, 0), Double(max)) : 0
    let shown = value.formatted(.number.precision(.fractionLength(0...2)).grouping(.never).locale(locale))
    return RatingModel(value: value, max: max, filled: Int(value.rounded()), shown: shown)
  }

  // MARK: Dates

  static let utc = TimeZone(identifier: "UTC") ?? .gmt

  /// The UTC Gregorian calendar used for every date-only value.
  static var utcCalendar: Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = utc
    return calendar
  }

  /// "YYYY-MM-DD" as midnight UTC on that day, or nil if it isn't a real date.
  static func utcDay(_ s: String) -> Date? {
    guard isISODate(s) else { return nil }
    let parts = s.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    let components = DateComponents(year: parts[0], month: parts[1], day: parts[2])
    guard let date = utcCalendar.date(from: components),
      utcCalendar.dateComponents([.year, .month, .day], from: date) == DateComponents(year: parts[0], month: parts[1], day: parts[2])
    else { return nil }
    return date
  }

  /// A date as "YYYY-MM-DD", taking its day in UTC.
  static func isoDay(_ date: Date) -> String {
    let c = utcCalendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
  }

  /// A full ISO 8601 timestamp, such as "2026-09-30T14:05:00Z".
  static func isoInstant(_ s: String) -> Date? {
    (try? Date(s, strategy: .iso8601)) ?? (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(s))
  }

  static func mediumDate(_ date: Date, timeZone: TimeZone, locale: Locale) -> String {
    var style = Date.FormatStyle(date: .abbreviated, time: .omitted, locale: locale, calendar: Calendar(identifier: .gregorian))
    style.timeZone = timeZone
    return date.formatted(style)
  }
}

/// `YYYY-MM-DD` with ASCII digits.
func isISODate(_ s: String) -> Bool {
  let u = Array(s.utf8)
  guard u.count == 10, u[4] == UInt8(ascii: "-"), u[7] == UInt8(ascii: "-") else { return false }
  return [0, 1, 2, 3, 5, 6, 8, 9].allSatisfy { (UInt8(ascii: "0")...UInt8(ascii: "9")).contains(u[$0]) }
}
