// The Trusted Catalog for SwiftUI. These views own all styling: system colours and text styles, so
// light and dark mode and the user's text size (Dynamic Type) work everywhere. Nothing from the stream
// can choose a colour, a font or a layout beyond the catalog's fixed values. Stream text is always
// shown as plain text (`Text(verbatim:)`), never as Markdown.
#if canImport(SwiftUI)
import SwiftUI

struct NodeView: View {
  let node: OmniNode
  let context: RenderContext
  @Environment(\.locale) private var locale

  private var store: OmniStore { context.store }
  private func text(_ name: String) -> String { store.text(node.props[name]) }
  private func option(_ name: String) -> String? {
    if case .text(let s)? = node.props[name] { return s }
    return nil
  }
  private func number(_ name: String) -> Double? {
    if case .number(let n)? = node.props[name] { return n }
    return nil
  }

  var body: some View {
    switch node.type {
    case .stack: stack
    case .card: card
    case .heading: heading
    case .text: textView
    case .input: InputField(node: node, store: store)
    case .button: GovernedButton(node: node, context: context)
    case .divider: Divider()
    case .badge: badge
    case .skeleton: SkeletonLines(lines: Int(number("lines") ?? 1))
    case .image: picture
    case .rating: rating
    case .dateInput: DateField(node: node, store: store)
    case .list: list
    case .listItem: listItem
    case .message: message
    }
  }

  // MARK: Layout

  private var gap: CGFloat {
    switch option("gap") {
    case "none": 0
    case "sm": 8
    case "lg": 24
    default: 16
    }
  }

  @ViewBuilder private var stack: some View {
    let align = option("align") ?? "stretch"
    if option("direction") == "row" {
      let vertical: VerticalAlignment = align == "start" ? .top : align == "end" ? .bottom : .center
      HStack(alignment: vertical, spacing: gap) { Children(ids: node.children) }
    } else {
      let horizontal: HorizontalAlignment = align == "center" ? .center : align == "end" ? .trailing : .leading
      VStack(alignment: horizontal, spacing: gap) { Children(ids: node.children, stretch: align == "stretch") }
    }
  }

  private var card: some View {
    VStack(alignment: .leading, spacing: 12) {
      if node.props["title"] != nil {
        Text(verbatim: text("title")).font(.headline)
      }
      Children(ids: node.children, stretch: true)
    }
    .padding(20)
    .frame(maxWidth: 512, alignment: .leading)
    .background(.background, in: RoundedRectangle(cornerRadius: 12))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(.separator))
    .accessibilityElement(children: .contain)
  }

  private var list: some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(node.children.enumerated()), id: \.element) { index, id in
        if index > 0 { Divider() }
        NodeSlot(id: id).frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .accessibilityElement(children: .contain)
  }

  // MARK: Text

  private var heading: some View {
    let font: Font = switch number("level") {
    case 1: .title.bold()
    case 3: .title3.weight(.semibold)
    default: .title2.bold()
    }
    return Text(verbatim: text("text")).font(font).accessibilityAddTraits(.isHeader)
  }

  @ViewBuilder private var textView: some View {
    let shown = Format.text(store.resolve(node.props["text"]), format: option("format"), currency: option("currency"), locale: locale)
    switch option("tone") {
    case "muted": Text(verbatim: shown).font(.body).foregroundStyle(.secondary)
    case "strong": Text(verbatim: shown).font(.title2.weight(.semibold))
    default: Text(verbatim: shown).font(.body)
    }
  }

  private var badge: some View {
    let tint: Color = switch option("tone") {
    case "success": .green
    case "warning": .orange
    case "danger": .red
    default: .secondary
    }
    return Text(verbatim: text("text"))
      .font(.caption.weight(.semibold))
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .foregroundStyle(tint)
      .background(tint.opacity(0.15), in: Capsule())
  }

  private var message: some View {
    let fromUser = option("from") == "user"
    let body = text("text")
    let shape = UnevenRoundedRectangle(
      topLeadingRadius: 16, bottomLeadingRadius: fromUser ? 16 : 4, bottomTrailingRadius: fromUser ? 4 : 16, topTrailingRadius: 16)
    return HStack {
      if fromUser { Spacer(minLength: 48) }
      Text(verbatim: body)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .foregroundStyle(fromUser ? AnyShapeStyle(.white) : AnyShapeStyle(.primary))
        .background(fromUser ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.quaternary), in: shape)
      if !fromUser { Spacer(minLength: 48) }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: "\(fromUser ? "You" : "Assistant"): \(body)"))
  }

  // MARK: Pictures

  @ViewBuilder private var picture: some View {
    let alt = text("alt")
    let ratio: CGFloat? = switch option("ratio") {
    case "1:1": 1
    case "4:3": 4.0 / 3
    case "3:2": 3.0 / 2
    case "16:9": 16.0 / 9
    default: nil
    }
    let frame = Color.clear.aspectRatio(ratio ?? 16.0 / 9, contentMode: .fit).frame(maxWidth: .infinity)
    if let image = context.pictures[text("asset")] {
      frame
        .overlay { image.resizable().scaledToFill() }
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: alt))
        .accessibilityAddTraits(.isImage)
    } else {
      // The stream named a picture this app doesn't have: show its description instead.
      frame
        .overlay { Text(verbatim: alt).font(.footnote).foregroundStyle(.secondary).padding(8) }
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: alt))
        .accessibilityAddTraits(.isImage)
    }
  }

  private var rating: some View {
    let model = Format.rating(store.resolve(node.props["value"]), max: number("max").map { Int($0) }, locale: locale)
    return HStack(spacing: 6) {
      HStack(spacing: 2) {
        ForEach(0..<model.max, id: \.self) { i in
          Image(systemName: i < model.filled ? "star.fill" : "star")
            .foregroundStyle(i < model.filled ? AnyShapeStyle(.orange) : AnyShapeStyle(.tertiary))
        }
      }
      .font(.subheadline)
      Text(verbatim: model.shown).font(.subheadline.weight(.semibold))
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: model.label))
  }

  private var listItem: some View {
    HStack(spacing: 12) {
      if node.props["image"] != nil {
        // Decorative: the title already says what it shows.
        Group {
          if let image = context.pictures[text("image")] {
            image.resizable().scaledToFill()
          } else {
            Color.clear.background(.quaternary)
          }
        }
        .frame(width: 48, height: 48)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityHidden(true)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: text("title")).font(.body.weight(.semibold))
        if node.props["detail"] != nil {
          Text(verbatim: text("detail")).font(.subheadline).foregroundStyle(.secondary)
        }
      }
      Spacer(minLength: 8)
      if node.props["trailing"] != nil {
        Text(verbatim: text("trailing")).font(.body.weight(.semibold))
      }
    }
    .padding(.vertical, 8)
    .accessibilityElement(children: .combine)
  }
}

// MARK: - Interactive components

/// An Input edits its `$key` locally; it never calls the backend by itself (R1).
struct InputField: View {
  let node: OmniNode
  let store: OmniStore

  var body: some View {
    let key = stateKey(node)
    let label = store.text(node.props["label"])
    VStack(alignment: .leading, spacing: 6) {
      Text(verbatim: label).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
      TextField(
        text: Binding(get: { store.stateText(key) }, set: { store.setState(key, .text($0)) }),
        prompt: node.props["placeholder"] == nil ? nil : Text(verbatim: store.text(node.props["placeholder"]))
      ) { Text(verbatim: label) }
        .labelsHidden()
        .textFieldStyle(.roundedBorder)
    }
  }
}

/// A DateInput edits a `$key` holding "YYYY-MM-DD" (or "" for no date), shown as that day in every time zone.
struct DateField: View {
  let node: OmniNode
  let store: OmniStore

  var body: some View {
    let key = stateKey(node)
    let label = store.text(node.props["label"])
    let lower = dateProp("min")
    let upper = dateProp("max")
    let day = Format.utcDay(store.stateText(key))
    VStack(alignment: .leading, spacing: 6) {
      Text(verbatim: label).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
      if let day {
        let selection = Binding<Date>(get: { day }, set: { store.setState(key, .text(Format.isoDay($0))) })
        Group {
          if let lower, let upper, lower <= upper {
            DatePicker(selection: selection, in: lower...upper, displayedComponents: .date) { Text(verbatim: label) }
          } else if let lower {
            DatePicker(selection: selection, in: lower..., displayedComponents: .date) { Text(verbatim: label) }
          } else if let upper {
            DatePicker(selection: selection, in: ...upper, displayedComponents: .date) { Text(verbatim: label) }
          } else {
            DatePicker(selection: selection, displayedComponents: .date) { Text(verbatim: label) }
          }
        }
        .labelsHidden()
        .environment(\.timeZone, Format.utc)
        .environment(\.calendar, Format.utcCalendar)
      } else {
        // No date yet: SwiftUI's date picker always holds a date, so it appears once one is chosen.
        Button("Choose a date") {
          var start = Format.utcDay(Format.isoDay(Date())) ?? Date()
          if let lower, start < lower { start = lower }
          if let upper, start > upper { start = upper }
          store.setState(key, .text(Format.isoDay(start)))
        }
        .buttonStyle(.bordered)
        .accessibilityLabel(Text(verbatim: "\(label): choose a date"))
      }
    }
  }

  private func dateProp(_ name: String) -> Date? {
    if case .text(let s)? = node.props[name] { return Format.utcDay(s) }
    return nil
  }
}

/// A Button. With an action it stays disabled until an McpMutation approves it, and a press goes
/// through the store's checks before the app's handler runs (R6).
struct GovernedButton: View {
  let node: OmniNode
  let context: RenderContext

  var body: some View {
    let store = context.store
    let label = store.text(node.props["label"])
    let governance = isMutating(node) ? store.governance(for: node.id) : .ready(tool: "")
    let error: String? = switch governance {
    case .notPermitted(let message), .blocked(_, let message): message
    default: nil
    }
    let enabled = if case .ready = governance { !store.isRunning(node.id) } else { false }
    VStack(alignment: .leading, spacing: 4) {
      styled(Button { context.press(node.id) } label: { Text(verbatim: label).frame(maxWidth: .infinity) })
        .controlSize(.large)
        .disabled(!enabled)
      if let error {
        Text(verbatim: error).font(.footnote).foregroundStyle(.red)
      }
    }
  }

  @ViewBuilder private func styled(_ button: some View) -> some View {
    switch node.props["variant"] {
    case .text("secondary")?: button.buttonStyle(.bordered)
    case .text("danger")?: button.buttonStyle(.borderedProminent).tint(.red)
    default: button.buttonStyle(.borderedProminent)
    }
  }
}

private func stateKey(_ node: OmniNode) -> String {
  if case .state(let key)? = node.props["value"] { return key }
  return ""
}
#endif
