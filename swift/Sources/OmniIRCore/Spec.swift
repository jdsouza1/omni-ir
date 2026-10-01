// The shapes Schema.generated.swift is written in: a Swift form of the subset of JSON Schema that
// conformance/schema.json uses. The parser validates props by interpreting these.

/// What a component accepts: its positional arguments, in order, and its props.
struct ComponentSpec: Sendable {
  let positional: [String]
  let props: [PropSpec]
}

struct PropSpec: Sendable {
  let name: String
  let required: Bool
  let value: ValueSpec
}

indirect enum ValueSpec: Sendable {
  /// Text, with optional length limits (in UTF-16 code units, as in JSON Schema) and a pattern.
  case text(minLength: Int?, maxLength: Int?, pattern: String?)
  /// A finite number, optionally a whole number, within optional limits.
  case number(minimum: Double?, maximum: Double?, integer: Bool)
  case boolean
  case null
  /// One of the listed text values.
  case oneOf([String])
  case textConstant(String)
  case numberConstant(Double)
  /// A `$key` reference.
  case state
  /// A component id.
  case ref
  /// A list of component ids (children).
  case refList(maxItems: Int?)
  /// An object with checked keys and values (McpMutation params).
  case record(key: ValueSpec, value: ValueSpec)
  /// Any of these.
  case anyOf([ValueSpec])
}
