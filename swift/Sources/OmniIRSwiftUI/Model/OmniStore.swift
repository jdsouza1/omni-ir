// The renderer's model: an observable document fed by the parser, plus everything a view needs that
// isn't drawing (resolving $state, governance, actions). Foundation only, so it is tested on every
// platform; the SwiftUI views in Views/ stay thin.
import Foundation
import Observation
import OmniIRCore

/// A governed action, ready to send to the backend. Params have their `$state` values filled in and
/// have passed the tool's own check.
public struct MutationCall: Sendable, Equatable {
  /// The McpMutation's own id.
  public let id: String
  /// The Button it governs.
  public let target: String
  public let tool: String
  public let params: [String: Primitive]
}

public enum RendererEvent: Sendable, Equatable {
  /// `mutation_blocked` or `handler_failed`.
  case error(Issue)
  /// A Button without an action was pressed: purely local, it never reaches the backend.
  case press(id: String)
}

/// What one id shows right now.
public enum Slot: Equatable, Sendable {
  case node(OmniNode)
  /// Referenced but not arrived yet: a placeholder.
  case pending
  /// The stream ended without it: a fallback.
  case missing
}

/// Whether a Button with an action may be pressed.
public enum Governance: Equatable, Sendable {
  /// No McpMutation has approved it (yet): disabled.
  case ungoverned
  /// Its McpMutation names a tool the app doesn't allow: disabled, with a message.
  case notPermitted(message: String)
  case ready(tool: String)
  /// The last press failed the tool's check; it stays blocked until a value it used changes.
  case blocked(tool: String, message: String)
}

/// The app's confirmation for one tool ([9.1]): a sentence whose `{name}` placeholders are filled with
/// the params as plain text (write it as a string literal), or a closure that writes the sentence from
/// the checked params, for example to show an amount as currency. Shown as plain text either way.
public struct Confirmation: Sendable, ExpressibleByStringLiteral {
  private let write: @Sendable ([String: Primitive]) -> String

  public init(_ write: @escaping @Sendable ([String: Primitive]) -> String) {
    self.write = write
  }

  public init(stringLiteral template: String) {
    write = { params in fillTemplate(template, params.mapValues(displayText)) }
  }

  /// The sentence for these params.
  public func text(for params: [String: Primitive]) -> String { write(params) }
}

@MainActor
@Observable
public final class OmniStore {
  /// Everything accepted so far. Read from the parser rather than copied into the store: a copy
  /// shared the parser's dictionaries, so the next line copied them all and a long stream became
  /// quadratic (PLAN-HARDENING.md C.2). Views observe it through `revision`.
  public var document: OmniDocument {
    _ = revision
    return parser.document
  }
  /// Every parser error and warning so far, in order.
  public var issues: [Issue] {
    _ = revision
    return parser.issues
  }
  /// Changes whenever the document or the issues do; reading `document` or `issues` observes it.
  private var revision = 0
  /// The tools a screen may call, each with its params check.
  public let tools: ToolRegistry
  /// Names of the pictures the app provides.
  public let assets: Set<String>
  /// The app's confirmation for each tool whose actions need the person's say-so ([9.1]), such as
  /// `["payments.confirm": "Pay {amount}?"]`. Set by the app, never by the stream.
  public let confirm: [String: Confirmation]
  /// The fields whose messages show: left by the person, or checked by a press ([8.5]).
  public private(set) var shownFields: Set<String> = []

  @ObservationIgnored private let parser: OmniParser
  private var blocked: [String: (message: String, params: [String: Primitive])] = [:]
  private var running: Set<String> = []

  public init(
    tools: ToolRegistry, assets: Set<String> = [], confirm: [String: Confirmation] = [:],
    components: AppComponents = .none, pictures: [PicturePattern] = []
  ) {
    self.tools = tools
    self.assets = assets
    self.confirm = confirm
    parser = OmniParser(tools: tools, assets: assets, components: components, pictures: pictures)
  }

  /// An app component's props for its view (Step 20): each `$state` replaced by its current value, so
  /// a view never sees a reference.
  public func appProps(_ node: OmniNode) -> [String: PropValue] {
    node.props.mapValues { value in
      guard case .state(let key) = value else { return value }
      switch document.state[key] ?? .null {
      case .text(let s): return .text(s)
      case .number(let n): return .number(n)
      case .bool(let b): return .bool(b)
      case .null: return .null
      }
    }
  }

  // MARK: Feeding the stream

  /// Write text as it arrives; it may end anywhere, even in the middle of a line.
  public func write(_ text: String) {
    parser.write(text)
    sync()
  }

  /// Write UTF-8 bytes as they arrive.
  public func write(bytes: some Collection<UInt8>) {
    parser.write(bytes: bytes)
    sync()
  }

  /// End of stream: pending parts become fallbacks. Returns the end-of-stream issues.
  @discardableResult
  public func end() -> [Issue] {
    let found = parser.end()
    sync()
    return found
  }

  /// Apply an update from the app's own code to the ended screen (SPEC.md [10.29]): the same lines, where
  /// an id or `$key` the screen has is replaced. Applied whole or not at all. Never pass text a model wrote.
  @discardableResult
  public func update(_ text: String) -> UpdateResult {
    let result = parser.update(text)
    sync()
    return result
  }

  /// What to say after the last update ([8.8]): the title and text of each Notice it added or changed,
  /// politely, and nothing else; empty when there is nothing to say.
  public var updateAnnouncement: String {
    let doc = document
    guard let assigned = doc.lastUpdate.map({ Set($0.assigned) }) else { return "" }
    var words: [String] = []
    for id in doc.order {
      guard let n = doc.nodes[id], n.type == .notice else { continue }
      let reads = n.props.values.contains { if case .state(let key) = $0 { assigned.contains(key) } else { false } }
      guard assigned.contains(id) || reads else { continue }
      for prop in ["title", "text"] {
        let said = text(n.props[prop])
        if !said.isEmpty { words.append(said) }
      }
    }
    return words.joined(separator: ". ")
  }

  private func sync() {
    revision &+= 1
  }

  // MARK: Reading for display

  public func slot(_ id: String) -> Slot {
    if let node = document.nodes[id] { return .node(node) }
    return document.complete ? .missing : .pending
  }

  /// A prop's value, with a `$state` reference replaced by the state's current value.
  public func resolve(_ value: PropValue?) -> Primitive? {
    switch value {
    case .text(let s)?: .text(s)
    case .number(let n)?: .number(n)
    case .bool(let b)?: .bool(b)
    case .null?: .null
    case .state(let key)?: document.state[key] ?? .null
    default: nil
    }
  }

  /// A prop as display text: state resolved, numbers as JavaScript writes them, null as nothing.
  public func text(_ value: PropValue?) -> String {
    resolve(value).map(displayText) ?? ""
  }

  // MARK: Editing state (Input, DateInput)

  /// The text held by an Input's or DateInput's `$key` ("" when it holds anything else).
  public func stateText(_ key: String) -> String {
    if case .text(let s)? = document.state[key] { return s }
    return ""
  }

  /// A Switch's `$key`: true only when it holds `true`.
  public func stateBool(_ key: String) -> Bool {
    if case .bool(true)? = document.state[key] { return true }
    return false
  }

  /// A Select's chosen option, or "" when its `$key` holds anything that isn't one of the options.
  public func chosenOption(_ key: String, options: [String]) -> String {
    let value = stateText(key)
    return options.contains(value) ? value : ""
  }

  /// A chart's Series that have arrived, in order, with their position among the chart's children
  /// (so each keeps its colour as the others arrive).
  public func chartSeries(_ ids: [String]) -> [ChartSeries] {
    ids.enumerated().compactMap { index, id in
      guard let node = document.nodes[id], node.type == .series, case .text(let name)? = node.props["name"],
        case .list(let items)? = node.props["values"]
      else { return nil }
      let values = items.compactMap { if case .number(let n) = $0 { n } else { nil } }
      return ChartSeries(id: id, index: index, name: name, values: values)
    }
  }

  /// A pie chart's Slices that have arrived, in order, with their position among its children.
  public func chartSlices(_ ids: [String]) -> [ChartSlice] {
    ids.enumerated().compactMap { index, id in
      guard let node = document.nodes[id], node.type == .slice, case .text(let name)? = node.props["name"],
        case .number(let value)? = node.props["value"]
      else { return nil }
      return ChartSlice(id: id, index: index, name: name, value: value)
    }
  }

  /// The labels of a Tabs' children, in order; nil for a Tab that hasn't arrived yet.
  public func tabLabels(_ ids: [String]) -> [String?] {
    ids.map { id in
      guard let node = document.nodes[id], node.type == .tab, case .text(let label)? = node.props["label"] else { return nil }
      return label
    }
  }

  /// A local edit (R1): it never calls the backend by itself.
  public func setState(_ key: String, _ value: Primitive) {
    parser.setState(key, value)
    sync()
  }

  // MARK: Fields (SPEC.md section 8)

  /// A field's problem with its current value, shown or not; nil when it passes or isn't a field.
  public func fieldProblem(_ id: String) -> FieldProblem? {
    guard let node = document.nodes[id], let key = fieldKey(node) else { return nil }
    return checkField(node.type, props: node.props, value: document.state[key])
  }

  /// The problem to show under a field: only once the person has left it or a press checked it ([8.5]).
  public func visibleFieldProblem(_ id: String) -> FieldProblem? {
    shownFields.contains(id) ? fieldProblem(id) : nil
  }

  /// The person left a field: from now on its message shows while it fails.
  public func showField(_ id: String) {
    shownFields.insert(id)
  }

  // MARK: Actions (McpMutation governance)

  public func governance(for buttonId: String) -> Governance {
    guard let mutation = document.mutations[buttonId] else { return .ungoverned }
    // Second line of defence: the parser already rejects unknown tools, but check again.
    guard tools[mutation.tool] != nil else { return .notPermitted(message: "\"\(mutation.tool)\" is not a permitted action") }
    if let b = blocked[buttonId], b.params == params(of: mutation) {
      return .blocked(tool: mutation.tool, message: b.message)
    }
    return .ready(tool: mutation.tool)
  }

  /// True while the backend handles this Button's action, so it can't be sent twice.
  public func isRunning(_ buttonId: String) -> Bool {
    running.contains(buttonId)
  }

  /// A press: a Button without an action only reports it. A governed one checks, in order ([9.3]),
  /// the fields its params read, its params against the tool, and the app's confirmation, and only
  /// then calls the handler. `askConfirmation` shows the app's sentence and returns true when the
  /// person confirms; without one, a tool that needs confirmation never runs. Returns the first field
  /// that failed, for the view to move focus to ([8.6]), or nil.
  @discardableResult
  public func press(
    _ buttonId: String,
    onMutation: @MainActor (MutationCall) async throws -> Void,
    report: @MainActor (RendererEvent) -> Void,
    askConfirmation: @MainActor (String) async -> Bool = { _ in false }
  ) async -> String? {
    guard let node = document.nodes[buttonId], node.type == .button else { return nil }
    guard isMutating(node) else {
      report(.press(id: buttonId))
      return nil
    }
    guard case .ready = governance(for: buttonId), !running.contains(buttonId),
      let mutation = document.mutations[buttonId], let tool = tools[mutation.tool]
    else { return nil }

    // [8.6]: the fields its params read must pass first; their messages show, and nothing is sent.
    let fields = fieldsReadBy(mutation, in: document)
    if let failing = fields.first(where: { fieldProblem($0) != nil }) {
      shownFields.formUnion(fields)
      return failing
    }
    let params = params(of: mutation)
    let problems = tool.validate(params)
    if !problems.isEmpty {
      let message = problems.joined(separator: "; ")
      blocked[buttonId] = (message, params)
      report(.error(Issue(code: .mutationBlocked, message: message, id: mutation.id)))
      return nil
    }
    // [9.1]: the app's own sentence for this tool, written from the checked params as plain text.
    if let confirmation = confirm[mutation.tool], !(await askConfirmation(confirmation.text(for: params))) {
      return nil
    }
    running.insert(buttonId)
    defer { running.remove(buttonId) }
    do {
      try await onMutation(MutationCall(id: mutation.id, target: mutation.target, tool: mutation.tool, params: params))
    } catch {
      report(.error(Issue(code: .handlerFailed, message: "\(error)", id: buttonId)))
    }
    return nil
  }

  private func params(of mutation: Mutation) -> [String: Primitive] {
    mutation.params.mapValues { resolve($0) ?? .null }
  }
}

/// A state value as text, the way the web renderer shows it.
public func displayText(_ value: Primitive) -> String {
  switch value {
  case .text(let s): s
  case .number(let n): jsNumberText(n)
  case .bool(let b): b ? "true" : "false"
  case .null: ""
  }
}

public struct ChartSeries: Equatable, Identifiable, Sendable {
  public let id: String
  /// Position among the chart's children: picks the colour and line pattern.
  public let index: Int
  public let name: String
  public let values: [Double]
}

public struct ChartSlice: Equatable, Identifiable, Sendable {
  public let id: String
  public let index: Int
  public let name: String
  public let value: Double
}

/// A number as JavaScript's `String(n)` writes it: no ".0" on whole numbers.
func jsNumberText(_ n: Double) -> String {
  if n.isFinite && n == n.rounded() && abs(n) < 1e21 { return String(Int64(n)) }
  return "\(n)"
}
