// The demo app's own components on iPhone (Step 20): the declarations come from the repo's
// app/components.json (bundled with the app), the same file the web and Android demos use, and these
// views draw them with system colours and text styles.
import Foundation
import OmniIRSwiftUI
import SwiftUI

/// What app/components.json declares: the components, picture families and which picture each product shows.
struct DemoComponentRegistry {
  let components: AppComponents
  let pictures: [PicturePattern]
  let productPictures: [String: String]

  static let bundled: DemoComponentRegistry = {
    guard let url = Bundle.main.url(forResource: "components", withExtension: "json"), let data = try? Data(contentsOf: url),
      let registry = try? appRegistry(fromJSON: data)
    else { return DemoComponentRegistry(components: .none, pictures: [], productPictures: [:]) }
    let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    let products = object?["productPictures"] as? [String: String] ?? [:]
    return DemoComponentRegistry(components: registry.components, pictures: registry.pictures, productPictures: products)
  }()
}

/// The views for the demo's components, by name.
@MainActor let demoAppViews: [String: AppView] = [
  "ProductCard": { AnyView(ProductCardView(p: $0)) },
  "QuantityPicker": { AnyView(QuantityPickerView(p: $0)) },
]

private func text(_ p: PropValue?) -> String? { if case .text(let s)? = p { s } else { nil } }
private func number(_ p: PropValue?) -> Double? { if case .number(let n)? = p { n } else { nil } }

private struct ProductCardView: View {
  let p: AppViewProps

  var body: some View {
    let name = text(p.props["name"]) ?? ""
    let price = number(p.props["price"])
    let currency = text(p.props["currency"]) ?? "USD"
    let rating = number(p.props["rating"])
    var badges: [String] = []
    if case .list(let items)? = p.props["badges"] { badges = items.compactMap(text) }
    return HStack(alignment: .top, spacing: 14) {
      Group {
        if let image = p.picture(text(p.props["picture"])) {
          image.resizable().scaledToFill()
        } else {
          Color.secondary.opacity(0.15)
        }
      }
      .frame(width: 88, height: 88)
      .clipShape(RoundedRectangle(cornerRadius: 8))
      .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 6) {
        Text(verbatim: name).font(.headline).accessibilityAddTraits(.isHeader)
        if let price { Text(price, format: .currency(code: currency)).font(.title3.weight(.semibold)) }
        if let rating {
          Text(verbatim: "Rated \(rating.formatted()) out of 5").font(.footnote).foregroundStyle(.secondary)
        }
        if !badges.isEmpty {
          HStack(spacing: 6) {
            ForEach(badges, id: \.self) { badge in
              Text(verbatim: badge).font(.caption).padding(.horizontal, 8).padding(.vertical, 2).background(.quaternary, in: Capsule())
            }
          }
        }
        HStack(spacing: 8) { p.children }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(14)
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(.quaternary))
  }
}

private struct QuantityPickerView: View {
  let p: AppViewProps

  var body: some View {
    let label = text(p.props["label"]) ?? ""
    let low = Int(number(p.props["min"]) ?? 0)
    let high = Int(number(p.props["max"]) ?? 99)
    var current: Int?
    if case .number(let n)? = p.field?.value { current = Int(n) }
    let shown = current
    return VStack(alignment: .leading, spacing: 6) {
      Text(verbatim: label).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
      Stepper(value: Binding(get: { shown ?? low }, set: { p.field?.set(.number(Double(min(high, max(low, $0))))); p.field?.leave() }), in: low...max(low, high)) {
        Text(verbatim: shown.map(String.init) ?? "–").font(.title3).monospacedDigit()
      }
      .accessibilityLabel(Text(verbatim: label))
      .accessibilityValue(Text(verbatim: shown.map(String.init) ?? "none"))
    }
  }
}
