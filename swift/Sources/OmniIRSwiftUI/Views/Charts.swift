// Charts for the SwiftUI Trusted Catalog (Step 11), drawn with Apple's Swift Charts, which reads each
// mark to VoiceOver and offers audio graphs. The stream supplies a title, labels and numbers; the
// colours, axes and legend are the catalog's own.
#if canImport(SwiftUI)
import Charts
import SwiftUI

extension Color {
  /// A colour from the design tokens (OmniPalette), given as 0xRRGGBB.
  init(omni rgb: UInt32) {
    self.init(red: Double((rgb >> 16) & 0xFF) / 255, green: Double((rgb >> 8) & 0xFF) / 255, blue: Double(rgb & 0xFF) / 255)
  }
}

/// The palette for the current light or dark appearance: the shared defaults (PLAN-THEMES.md), the same as the web's.
func omniPalette(_ scheme: ColorScheme) -> OmniPalette { scheme == .dark ? .dark : .light }

/// Line charts also tell series apart by dash pattern, so colour is never the only cue.
private let chartDashes: [[CGFloat]] = [[], [6, 4], [2, 3], [10, 3, 2, 3], [1, 4], [12, 4]]

/// Series colours in a fixed order, the same as the web renderer's (checked for colour blindness).
private func color(_ index: Int, _ scheme: ColorScheme) -> Color {
  let colors = omniPalette(scheme).charts
  return Color(omni: colors[index % colors.count])
}

/// A bar or line chart. Series arrive on their own lines; each keeps its colour as others arrive.
struct XYChartView: View {
  let node: OmniNode
  let store: OmniStore
  let line: Bool
  @Environment(\.locale) private var locale
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let labels = Format.texts(node.props["labels"])
    let series = store.chartSeries(node.children)
    let format = option("format")
    let currency = option("currency")
    let names = series.map(\.name)
    VStack(alignment: .leading, spacing: 8) {
      Text(verbatim: title).font(.subheadline.weight(.semibold))
      Chart {
        ForEach(series) { s in
          ForEach(Array(zip(labels, s.values).enumerated()), id: \.offset) { _, point in
            if line {
              LineMark(x: .value("Label", point.0), y: .value("Value", point.1))
                .foregroundStyle(by: .value("Series", s.name))
                .lineStyle(StrokeStyle(lineWidth: 2, dash: chartDashes[s.index % chartDashes.count]))
                .symbol(by: .value("Series", s.name))
                .accessibilityLabel(Text(verbatim: "\(point.0), \(s.name)"))
                .accessibilityValue(Text(verbatim: Format.chartValue(point.1, format: format, currency: currency, locale: locale)))
            } else {
              BarMark(x: .value("Label", point.0), y: .value("Value", point.1))
                .foregroundStyle(by: .value("Series", s.name))
                .position(by: .value("Series", s.name))
                .cornerRadius(3)
                .accessibilityLabel(Text(verbatim: "\(point.0), \(s.name)"))
                .accessibilityValue(Text(verbatim: Format.chartValue(point.1, format: format, currency: currency, locale: locale)))
            }
          }
        }
      }
      .chartForegroundStyleScale(domain: names, range: series.map { color($0.index, colorScheme) })
      .chartXScale(domain: labels)
      .chartYAxis {
        AxisMarks { value in
          AxisGridLine()
          AxisValueLabel {
            if let v = value.as(Double.self) { Text(verbatim: Format.chartTick(v, format: format, currency: currency, locale: locale)) }
          }
        }
      }
      // One Series needs no legend: the title names it.
      .chartLegend(node.children.count >= 2 ? .visible : .hidden)
      .frame(height: 200)
      .accessibilityLabel(Text(verbatim: title))
    }
  }

  private var title: String { store.text(node.props["title"]) }
  private func option(_ name: String) -> String? {
    if case .text(let s)? = node.props[name] { return s }
    return nil
  }
}

/// A pie chart, with each slice's name and share in the legend below it.
struct PieChartView: View {
  let node: OmniNode
  let store: OmniStore
  @Environment(\.locale) private var locale
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let slices = store.chartSlices(node.children)
    let total = slices.reduce(0) { $0 + $1.value }
    let format = option("format")
    let currency = option("currency")
    VStack(alignment: .leading, spacing: 8) {
      Text(verbatim: store.text(node.props["title"])).font(.subheadline.weight(.semibold))
      Chart(slices) { s in
        SectorMark(angle: .value("Value", s.value), angularInset: 1)
          .foregroundStyle(color(s.index, colorScheme))
          .accessibilityLabel(Text(verbatim: s.name))
          .accessibilityValue(Text(verbatim: "\(Format.chartValue(s.value, format: format, currency: currency, locale: locale)), \(Format.share(s.value, of: total, locale: locale))"))
      }
      .frame(height: 180)
      VStack(alignment: .leading, spacing: 4) {
        ForEach(slices) { s in
          HStack(spacing: 8) {
            Circle().fill(color(s.index, colorScheme)).frame(width: 10, height: 10).accessibilityHidden(true)
            Text(verbatim: s.name).font(.subheadline)
            Spacer(minLength: 8)
            Text(verbatim: Format.share(s.value, of: total, locale: locale)).font(.subheadline).foregroundStyle(.secondary).monospacedDigit()
          }
          .accessibilityElement(children: .combine)
        }
      }
    }
  }

  private func option(_ name: String) -> String? {
    if case .text(let s)? = node.props[name] { return s }
    return nil
  }
}
#endif
