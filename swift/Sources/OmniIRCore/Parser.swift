// Streaming parser: chunks → lines → statements → validation → document.
// A bad line is reported and skipped; it never stops the stream.
import Foundation

public final class OmniParser {
  public let tools: ToolRegistry
  /// Names of the pictures in the app's asset registry.
  public let assets: Set<String>
  public private(set) var document = OmniDocument()

  public init(tools: ToolRegistry, assets: Set<String> = []) {
    self.tools = tools
    self.assets = assets
  }

  /// Write text as it arrives; it may end anywhere, even in the middle of a line.
  public func write(_ text: String) {
    write(bytes: Array(text.utf8))
  }

  /// Write UTF-8 bytes as they arrive; a chunk may end in the middle of a character.
  public func write(bytes: some Collection<UInt8>) {
    // Not implemented yet (iOS plan, task C).
  }

  /// End of stream: flush the last line, run the whole-document checks and mark missing references.
  /// Returns the end-of-stream issues.
  @discardableResult
  public func end() -> [Issue] {
    []
  }

  /// Every error and warning reported so far, in order.
  public private(set) var issues: [Issue] = []
}
