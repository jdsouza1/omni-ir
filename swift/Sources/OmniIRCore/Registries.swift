// What the host app supplies: the tools a screen may call and the pictures it may show.
// A stream can name only these; it can never add to them.

/// One backend action the UI may trigger, with a check for its params.
public struct Tool: Sendable {
  /// Returns problems with the params (empty when they are valid).
  public let validate: @Sendable ([String: Primitive]) -> [String]

  public init(validate: @escaping @Sendable ([String: Primitive]) -> [String]) {
    self.validate = validate
  }

  /// A tool that accepts any params; for tests and demos only.
  public static let acceptsAnything = Tool { _ in [] }
}

/// Tools by name, such as `"payments.confirm"`.
public typealias ToolRegistry = [String: Tool]
