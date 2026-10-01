// OmniView: draws a streaming Omni-IR document with the Trusted Catalog. One NodeSlot per id, so a
// component keeps its identity (and an Input its focus) while more lines arrive.
#if canImport(SwiftUI)
import SwiftUI

public struct OmniView: View {
  private let context: RenderContext

  /// - Parameters:
  ///   - store: The document, fed by `store.write(_:)` as the stream arrives.
  ///   - pictures: The app's asset registry as images, by the names the stream uses. Pass the same names
  ///     to the store; a stream can never show a picture from anywhere else.
  ///   - onMutation: Runs a governed action. Its params are resolved and already checked by the tool.
  ///   - onEvent: Blocked actions, failed handlers and presses of Buttons without an action.
  public init(
    store: OmniStore,
    pictures: [String: Image] = [:],
    onMutation: @escaping @MainActor (MutationCall) async throws -> Void,
    onEvent: @escaping @MainActor (RendererEvent) -> Void = { _ in }
  ) {
    context = RenderContext(store: store, pictures: pictures, onMutation: onMutation, onEvent: onEvent)
  }

  public var body: some View {
    NodeSlot(id: "root")
      .environment(\.omniContext, context)
  }
}

@MainActor
final class RenderContext {
  let store: OmniStore
  let pictures: [String: Image]
  let onMutation: @MainActor (MutationCall) async throws -> Void
  let onEvent: @MainActor (RendererEvent) -> Void

  init(
    store: OmniStore,
    pictures: [String: Image],
    onMutation: @escaping @MainActor (MutationCall) async throws -> Void,
    onEvent: @escaping @MainActor (RendererEvent) -> Void
  ) {
    self.store = store
    self.pictures = pictures
    self.onMutation = onMutation
    self.onEvent = onEvent
  }

  func press(_ id: String) {
    Task { await store.press(id, onMutation: onMutation, report: onEvent) }
  }
}

private struct OmniContextKey: EnvironmentKey {
  static let defaultValue: RenderContext? = nil
}

extension EnvironmentValues {
  var omniContext: RenderContext? {
    get { self[OmniContextKey.self] }
    set { self[OmniContextKey.self] = newValue }
  }
}

/// What one id shows: its component, a placeholder while it hasn't arrived, or a fallback if it never does.
struct NodeSlot: View {
  let id: String
  @Environment(\.omniContext) private var context

  var body: some View {
    if let context {
      switch context.store.slot(id) {
      case .node(let node): NodeView(node: node, context: context)
      case .pending: SkeletonLines(lines: 1)
      case .missing: FallbackView()
      }
    }
  }
}

/// A list of children, each in its own slot.
struct Children: View {
  let ids: [String]
  /// Fill the container's width (column layouts).
  var stretch = false
  /// Keep each child at its natural width, without wrapping (row layouts that may not fit).
  var natural = false

  var body: some View {
    ForEach(ids, id: \.self) { id in
      if stretch {
        NodeSlot(id: id).frame(maxWidth: .infinity, alignment: .leading)
      } else if natural {
        NodeSlot(id: id).fixedSize(horizontal: true, vertical: false)
      } else {
        NodeSlot(id: id)
      }
    }
  }
}

struct SkeletonLines: View {
  let lines: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      ForEach(0..<max(1, lines), id: \.self) { i in
        RoundedRectangle(cornerRadius: 4)
          .fill(.quaternary)
          .frame(height: 14)
          .frame(maxWidth: i == lines - 1 && lines > 1 ? 180 : .infinity, alignment: .leading)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Loading")
  }
}

/// Shown in place of a component that never arrived, about the size of a placeholder.
struct FallbackView: View {
  var body: some View {
    Text("Component failed to load")
      .font(.footnote)
      .foregroundStyle(.secondary)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .frame(maxWidth: .infinity, alignment: .leading)
      .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.secondary.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
  }
}
#endif
