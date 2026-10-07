// Streaming parser: chunks → lines (R2) → statements (R4) → validation → document.
// A bad line is reported and skipped; it never stops the stream. Port of packages/core/src/parser.ts.

/// What happened as the stream was read, in order.
public enum ParserEvent: Sendable, Equatable {
  /// A line defined this component, McpMutation or `$key`.
  case node(id: String, line: Int)
  /// A reference that hasn't arrived yet; a placeholder shows until it does.
  case pending(id: String, line: Int)
  /// A pending reference arrived.
  case resolved(id: String, line: Int)
  case warning(Issue)
  case error(Issue)
  /// End of stream, with the end-of-stream issues.
  case end([Issue])
}

public final class OmniParser {
  public let tools: ToolRegistry
  /// Names of the pictures in the app's asset registry. Without them, no Image is accepted.
  public let assets: Set<String>
  /// Everything accepted so far.
  public private(set) var document = OmniDocument()
  /// Every error and warning reported so far, in order (end-of-stream issues included after `end()`).
  public private(set) var issues: [Issue] = []
  /// Called for every event, in order.
  public var onEvent: ((ParserEvent) -> Void)?
  /// Called whenever `document` changes.
  public var onChange: ((OmniDocument) -> Void)?

  private var buffer: LineBuffer
  private var accepted: [Statement] = []
  private var index = DocumentIndex()
  private var lineOf: [String: Int] = [:]
  private var endIssues: [Issue]?

  public init(tools: ToolRegistry, assets: Set<String> = [], maxLineLength: Int = Limits.lineLength) {
    self.tools = tools
    self.assets = assets
    self.buffer = LineBuffer(maxLineLength: maxLineLength)
  }

  /// Write text as it arrives; it may end anywhere, even in the middle of a line. Ignored after `end()`.
  public func write(_ text: String) {
    guard endIssues == nil else { return }
    for event in buffer.push(text) { handle(event) }
  }

  /// Write UTF-8 bytes as they arrive; a chunk may end in the middle of a character. Ignored after `end()`.
  public func write(bytes: some Collection<UInt8>) {
    guard endIssues == nil else { return }
    for event in buffer.push(bytes: bytes) { handle(event) }
  }

  /// End of stream: flush the last line, run the whole-document checks and mark missing references.
  /// Returns the end-of-stream issues. Calling it again returns the same issues.
  @discardableResult
  public func end() -> [Issue] {
    if let endIssues { return endIssues }
    for event in buffer.end() { handle(event) }
    let found = validateDocument(accepted, complete: true).map { issue -> Issue in
      var issue = issue
      if let id = issue.id, let line = lineOf[id] { issue.line = line }
      return issue
    }
    endIssues = found
    document.finish()
    onChange?(document)
    for issue in found {
      issues.append(issue)
      onEvent?(.error(issue))
    }
    onEvent?(.end(found))
    return found
  }

  /// A local state edit from an Input or DateInput (R1). The key must already be declared by the stream.
  public func setState(_ key: String, _ value: Primitive) {
    guard document.state[key] != nil, document.state[key] != value else { return }
    document.state[key] = value
    onChange?(document)
  }

  private func reject(_ found: [Issue], line: Int) {
    for var issue in found {
      issue.line = line
      issues.append(issue)
      onEvent?(.error(issue))
    }
  }

  private func handle(_ event: LineEvent) {
    switch event {
    case .overflow(let line, let length):
      reject([Issue(code: .lineTooLong, message: "line is longer than the limit (\(length) characters seen)")], line: line)
    case .line(let text, let line):
      if line == 1 && isNewerMarker(text) {
        let warning = Issue(
          code: .newerVersion, message: "the stream was written for a newer Omni-IR format than this parser's (\(omniIRFormatVersion))", line: line)
        issues.append(warning)
        onEvent?(.warning(warning))
        document.newerVersion = true
      }
      switch parseLine(text) {
      case .empty:
        return
      case .error(let issue):
        reject([issue], line: line)
      case .statement(let raw, let warnings):
        for var warning in warnings {
          warning.line = line
          issues.append(warning)
          onEvent?(.warning(warning))
        }
        switch validateStatement(raw, ValidationContext(tools: tools, assets: assets)) {
        case .failed(let issue):
          reject([issue], line: line)
        case .ok(let statement):
          // The accepted statements are always consistent, so any new issue is caused by this line.
          // The index checks only what the line touches, so a long stream stays linear.
          let conflicts = index.check(statement)
          if !conflicts.isEmpty { return reject(conflicts, line: line) }
          accepted.append(statement)
          index.add(statement)
          let id = statement.definedId
          lineOf[id] = line
          let (pending, resolved) = document.apply(statement)
          onChange?(document)
          onEvent?(.node(id: id, line: line))
          for ref in resolved { onEvent?(.resolved(id: ref, line: line)) }
          for ref in pending { onEvent?(.pending(id: ref, line: line)) }
        }
      }
    }
  }
}

extension OmniDocument {
  /// Add an accepted statement. Returns the references it left pending and the ones it resolved.
  mutating func apply(_ statement: Statement) -> (pending: [String], resolved: [String]) {
    var newlyPending: [String] = []
    var resolved: [String] = []
    func define(_ id: String) {
      if pending.remove(id) != nil { resolved.append(id) }
    }

    var refs: [String] = []
    switch statement {
    case .state(let key, let value):
      state[key] = value
      define(key)
    case .node(let n):
      nodes[n.id] = n
      define(n.id)
      refs = n.children + stateKeys(n.props)
    case .mutation(let m):
      mutations[m.target] = m
      refs = stateKeys(m.params)
    }
    for ref in refs {
      let known = ref.hasPrefix("$") ? state[ref] != nil : nodes[ref] != nil
      if !known && pending.insert(ref).inserted { newlyPending.append(ref) }
    }
    return (newlyPending, resolved)
  }

  /// End of stream: every still-pending reference becomes missing.
  mutating func finish() {
    guard !complete else { return }
    missing = pending
    pending = []
    complete = true
  }
}
