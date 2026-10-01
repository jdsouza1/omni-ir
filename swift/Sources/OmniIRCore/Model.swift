// The values a parser produces: issues, props, components, McpMutations and the document.
// They mirror packages/core/src (TypeScript), so both implementations describe a stream the same way.

public enum IssueSeverity: String, Sendable, Hashable {
  case error, warning
}

/// When an issue is found: on its own line, at the end of the stream, or while rendering.
public enum IssueStage: String, Sendable, Hashable {
  case line, end, renderer
}

public struct Issue: Sendable, Hashable, CustomStringConvertible {
  public var code: IssueCode
  public var message: String
  /// The component id or `$key` the issue is about, when there is one.
  public var id: String?
  /// 1-based line number in the stream; `nil` for end-of-stream issues such as `missing_root`.
  public var line: Int?

  public init(code: IssueCode, message: String, id: String? = nil, line: Int? = nil) {
    self.code = code
    self.message = message
    self.id = id
    self.line = line
  }

  public var description: String {
    "\(line.map { "line \($0)" } ?? "end"): \(code.rawValue): \(message)"
  }
}

/// A state value: text, a number, true or false, or null.
public enum Primitive: Sendable, Hashable {
  case text(String)
  case number(Double)
  case bool(Bool)
  case null
}

/// A validated prop or McpMutation param.
public enum PropValue: Sendable, Hashable {
  case text(String)
  case number(Double)
  case bool(Bool)
  case null
  /// A `$key` reference, resolved against the document's state when rendering.
  case state(String)
  /// A component id (only McpMutation's target).
  case ref(String)
  /// McpMutation params.
  case record([String: PropValue])
}

/// An accepted component. `props` never contains `children`; they are in `children`, in order.
public struct OmniNode: Sendable, Hashable, Identifiable {
  public let id: String
  public let type: ComponentType
  public let props: [String: PropValue]
  public let children: [String]

  public init(id: String, type: ComponentType, props: [String: PropValue], children: [String]) {
    self.id = id
    self.type = type
    self.props = props
    self.children = children
  }
}

/// An accepted McpMutation: approval for one Button to call one tool from the app's registry.
public struct Mutation: Sendable, Hashable, Identifiable {
  public let id: String
  /// The id of the Button it governs.
  public let target: String
  public let tool: String
  public let params: [String: PropValue]

  public init(id: String, target: String, tool: String, params: [String: PropValue]) {
    self.id = id
    self.target = target
    self.tool = tool
    self.params = params
  }
}

/// Everything accepted so far.
public struct OmniDocument: Sendable {
  /// Components by id.
  public var nodes: [String: OmniNode] = [:]
  /// McpMutations by the id of the Button they govern.
  public var mutations: [String: Mutation] = [:]
  /// Current state: declared by the stream, then edited by Input and DateInput.
  public var state: [String: Primitive] = [:]
  /// Component ids and `$keys` referenced but not arrived yet.
  public var pending: Set<String> = []
  /// After the end of the stream: references that never arrived.
  public var missing: Set<String> = []
  public var complete = false

  public init() {}
}
