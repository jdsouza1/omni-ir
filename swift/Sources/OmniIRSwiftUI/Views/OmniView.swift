// OmniView: draws a streaming Omni-IR document with the Trusted Catalog. One NodeSlot per id, so a
// component keeps its identity (and an Input its focus) while more lines arrive.
#if canImport(SwiftUI)
import SwiftUI

public struct OmniView: View {
  private let store: OmniStore
  private let pictures: [String: Image]
  private let onMutation: @MainActor (MutationCall) async throws -> Void
  private let onEvent: @MainActor (RendererEvent) -> Void
  private let appViews: [String: AppView]
  private let resolvePicture: @MainActor (String) -> Image?
  @State private var ui = ViewState()
  @Environment(\.omniStrings) private var strings

  /// - Parameters:
  ///   - store: The document, fed by `store.write(_:)` as the stream arrives.
  ///   - pictures: The app's asset registry as images, by the names the stream uses. Pass the same names
  ///     to the store; a stream can never show a picture from anywhere else.
  ///   - onMutation: Runs a governed action. Its params are resolved and already checked by the tool.
  ///   - onEvent: Blocked actions, failed handlers and presses of Buttons without an action.
  ///   - appViews: The app's views for its own components (Step 20), by name; give the store the same
  ///     components. A declared component without one shows the renderer's fallback.
  ///   - resolvePicture: Pictures the app looks up when a screen is drawn, for names that match the
  ///     store's picture patterns (Step 20), such as `product-1042`. Nil when there is none.
  ///
  /// Tools that need the person's confirmation are set on the store (`OmniStore(confirm:)`); the view
  /// asks with its own alert (SPEC.md section 9, Confirmations).
  public init(
    store: OmniStore,
    pictures: [String: Image] = [:],
    onMutation: @escaping @MainActor (MutationCall) async throws -> Void,
    onEvent: @escaping @MainActor (RendererEvent) -> Void = { _ in },
    appViews: [String: AppView] = [:],
    resolvePicture: @escaping @MainActor (String) -> Image? = { _ in nil }
  ) {
    self.store = store
    self.pictures = pictures
    self.onMutation = onMutation
    self.onEvent = onEvent
    self.appViews = appViews
    self.resolvePicture = resolvePicture
  }

  public var body: some View {
    let context = RenderContext(
      store: store, pictures: pictures, onMutation: onMutation, onEvent: onEvent, ui: ui, strings: strings,
      appViews: appViews, resolvePicture: resolvePicture
    )
    Group {
      // The marker is line 1, so the notice appears before anything else and never moves the screen.
      if context.store.document.newerVersion {
        VStack(alignment: .leading, spacing: 12) {
          VersionNotice()
          NodeSlot(id: "root")
        }
      } else {
        NodeSlot(id: "root")
      }
    }
    .environment(\.omniContext, context)
    // [8.8]: after an update, read out what changed Notices say, politely; nothing moves focus.
    .onChange(of: store.document.lastUpdate) { _, update in
      guard update != nil else { return }
      let said = store.updateAnnouncement
      if !said.isEmpty { AccessibilityNotification.Announcement(said).post() }
    }
    // [9.1]: the app's sentence, Cancel and Confirm. Only the buttons answer, so a dismissal can't
    // be taken for a confirmation.
    .alert(Text(verbatim: ui.question ?? ""), isPresented: Binding(get: { ui.question != nil }, set: { _ in })) {
      Button(role: .cancel) { ui.reply(false) } label: { Text(verbatim: strings.cancel) }
      Button { ui.reply(true) } label: { Text(verbatim: strings.confirm) }
    }
  }
}

/// What the view shows on top of the screen: the app's confirmation, and which field to focus.
@MainActor
@Observable
final class ViewState {
  /// The app's sentence for a press waiting for the person's answer ([9.1]).
  private(set) var question: String?
  /// The field a press asked to focus because it failed ([8.6]); the field clears it.
  var focusRequest: String?
  @ObservationIgnored private var answer: CheckedContinuation<Bool, Never>?

  /// Ask, and wait for Cancel or Confirm. One question at a time: a new one cancels the last.
  func ask(_ text: String) async -> Bool {
    answer?.resume(returning: false)
    return await withCheckedContinuation { continuation in
      answer = continuation
      question = text
    }
  }

  func reply(_ confirmed: Bool) {
    let pending = answer
    answer = nil
    question = nil
    pending?.resume(returning: confirmed)
  }
}

/// The stream was written for a newer Omni-IR version (SPEC.md section 8): say the app needs an update.
private struct VersionNotice: View {
  @Environment(\.omniStrings) private var strings
  @Environment(\.colorScheme) private var colorScheme

  var body: some View {
    let palette = omniPalette(colorScheme)
    Text(verbatim: strings.newerVersion)
      .font(.footnote)
      .foregroundStyle(Color(omni: palette.text))
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(10)
      .background(Color(omni: palette.warningSoft), in: RoundedRectangle(cornerRadius: 10))
  }
}

@MainActor
final class RenderContext {
  let store: OmniStore
  let pictures: [String: Image]
  let onMutation: @MainActor (MutationCall) async throws -> Void
  let onEvent: @MainActor (RendererEvent) -> Void
  let ui: ViewState
  let strings: OmniStrings
  /// The app's views for its own components (Step 20).
  let appViews: [String: AppView]
  let resolvePicture: @MainActor (String) -> Image?

  /// A picture by name: the app's registered ones, then its lookup (Step 20).
  func picture(_ name: String?) -> Image? {
    guard let name else { return nil }
    return pictures[name] ?? resolvePicture(name)
  }

  init(
    store: OmniStore,
    pictures: [String: Image],
    onMutation: @escaping @MainActor (MutationCall) async throws -> Void,
    onEvent: @escaping @MainActor (RendererEvent) -> Void,
    ui: ViewState,
    strings: OmniStrings,
    appViews: [String: AppView] = [:],
    resolvePicture: @escaping @MainActor (String) -> Image? = { _ in nil }
  ) {
    self.store = store
    self.pictures = pictures
    self.onMutation = onMutation
    self.onEvent = onEvent
    self.ui = ui
    self.strings = strings
    self.appViews = appViews
    self.resolvePicture = resolvePicture
  }

  func press(_ id: String) {
    let ui = ui
    let strings = strings
    Task {
      let failed = await store.press(id, onMutation: onMutation, report: onEvent, askConfirmation: { await ui.ask($0) })
      guard let failed else { return }
      // [8.6]: focus the first field that failed and read its message out.
      ui.focusRequest = failed
      if let problem = store.visibleFieldProblem(failed) {
        AccessibilityNotification.Announcement(strings.field(problem)).post()
      }
    }
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

  /// The renderer's own words (PLAN-THEMES.md): the app's, or English.
  public var omniStrings: OmniStrings {
    get { self[OmniStringsKey.self] }
    set { self[OmniStringsKey.self] = newValue }
  }
}

private struct OmniStringsKey: EnvironmentKey {
  static let defaultValue = OmniStrings.english
}

extension View {
  /// Replace the renderer's own words, for example `OmniStrings(loading: "Chargement")`. They are shown
  /// as plain text; the app sets them, never the stream.
  public func omniStrings(_ strings: OmniStrings) -> some View {
    environment(\.omniStrings, strings)
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
  @Environment(\.omniStrings) private var strings
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
    .accessibilityLabel(Text(verbatim: strings.loading))
  }
}

/// Shown in place of a component that never arrived, about the size of a placeholder.
struct FallbackView: View {
  @Environment(\.omniStrings) private var strings
  var body: some View {
    Text(verbatim: strings.failedToLoad)
      .font(.footnote)
      .foregroundStyle(.secondary)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .frame(maxWidth: .infinity, alignment: .leading)
      .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.secondary.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
  }
}
#endif
