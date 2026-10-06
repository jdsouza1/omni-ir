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

  @ObservationIgnored private let parser: OmniParser
  private var blocked: [String: (message: String, params: [String: Primitive])] = [:]
  private var running: Set<String> = []

  public init(tools: ToolRegistry, assets: Set<String> = []) {
    self.tools = tools
    self.assets = assets
    parser = OmniParser(tools: tools, assets: assets)
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

  /// A press: a Button without an action only reports it; a governed one fills in its params,
  /// checks them with the tool, and only then calls the handler.
  public func press(
    _ buttonId: String,
    onMutation: @MainActor (MutationCall) async throws -> Void,
    report: @MainActor (RendererEvent) -> Void
  ) async {
    guard let node = document.nodes[buttonId], node.type == .button else { return }
    guard isMutating(node) else { return report(.press(id: buttonId)) }
    guard case .ready = governance(for: buttonId), !running.contains(buttonId),
      let mutation = document.mutations[buttonId], let tool = tools[mutation.tool]
    else { return }

    let params = params(of: mutation)
    let problems = tool.validate(params)
    if !problems.isEmpty {
      let message = problems.joined(separator: "; ")
      blocked[buttonId] = (message, params)
      return report(.error(Issue(code: .mutationBlocked, message: message, id: mutation.id)))
    }
    running.insert(buttonId)
    defer { running.remove(buttonId) }
    do {
      try await onMutation(MutationCall(id: mutation.id, target: mutation.target, tool: mutation.tool, params: params))
    } catch {
      report(.error(Issue(code: .handlerFailed, message: "\(error)", id: buttonId)))
    }
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
