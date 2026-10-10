// Runs the language-neutral conformance suite (conformance/cases/*.json) against the Swift parser,
// following conformance/README.md: issues as distinct {line, code} pairs, the other parts only when
// a case lists them, and the same result however the input bytes are split.
import Foundation
import Testing
@testable import OmniIRCore

/// The repository root, found from this file's location (swift/Tests/OmniIRCoreTests/).
let repoRoot = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

// MARK: - Case files

indirect enum JSON: Hashable, Sendable, Decodable, CustomStringConvertible {
  case null, bool(Bool), number(Double), string(String), array([JSON]), object([String: JSON])

  init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() { self = .null }
    else if let b = try? c.decode(Bool.self) { self = .bool(b) }
    else if let n = try? c.decode(Double.self) { self = .number(n) }
    else if let s = try? c.decode(String.self) { self = .string(s) }
    else if let a = try? c.decode([JSON].self) { self = .array(a) }
    else { self = .object(try c.decode([String: JSON].self)) }
  }

  var description: String {
    switch self {
    case .null: "null"
    case .bool(let b): "\(b)"
    case .number(let n): n == n.rounded() && abs(n) < 1e15 ? "\(Int(n))" : "\(n)"
    case .string(let s): "\"\(s)\""
    case .array(let a): "[\(a.map(\.description).joined(separator: ", "))]"
    case .object(let o): "{\(o.keys.sorted().map { "\($0): \(o[$0]!)" }.joined(separator: ", "))}"
    }
  }
}

struct ExpectedIssue: Hashable, Sendable, Decodable, CustomStringConvertible {
  let line: Int?
  let code: String
  var description: String { "\(line.map(String.init) ?? "end"):\(code)" }
}

struct ConformanceCase: Sendable, Decodable, CustomTestStringConvertible {
  struct Expect: Sendable, Decodable {
    let issues: [ExpectedIssue]
    let nodes: [String: JSON]?
    let state: [String: JSON]?
    let mutations: [String: JSON]?
    let missing: [String]?
  }
  let id: String
  let rules: [String]
  let description: String
  let input: JSON
  let tools: [String]?
  let assets: [String]?
  /// The app's own components and picture patterns (Step 20), as plain JSON.
  let components: JSON?
  let pictures: JSON?
  let expect: Expect

  var testDescription: String { id }

  /// The stream: a string, or parts joined in order, where {repeat, times} is a long run of text.
  var text: String {
    switch input {
    case .string(let s): return s
    case .array(let parts):
      return parts.map { part -> String in
        switch part {
        case .string(let s): return s
        case .object(let o):
          guard case .string(let r) = o["repeat"], case .number(let n) = o["times"] else { fatalError("bad input part in \(id)") }
          return String(repeating: r, count: Int(n))
        default: fatalError("bad input part in \(id)")
        }
      }.joined()
    default: fatalError("bad input in \(id)")
    }
  }
}

enum CaseFiles {
  static func load() throws -> [ConformanceCase] {
    struct File: Decodable { let cases: [ConformanceCase] }
    let dir = repoRoot.appendingPathComponent("conformance/cases")
    let names = try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { $0.hasSuffix(".json") }.sorted()
    return try names.flatMap { try JSONDecoder().decode(File.self, from: Data(contentsOf: dir.appendingPathComponent($0))).cases }
  }

  static let cases: [ConformanceCase] = (try? load()) ?? []

  /// The differential corpus (fuzz/corpus.json): generated streams with the TypeScript parser's results.
  static func loadCorpus() throws -> [ConformanceCase] {
    struct File: Decodable { let cases: [ConformanceCase] }
    return try JSONDecoder().decode(File.self, from: Data(contentsOf: repoRoot.appendingPathComponent("fuzz/corpus.json"))).cases
  }

  static let corpus: [ConformanceCase] = (try? loadCorpus()) ?? []
}

extension JSON {
  /// As JSONSerialization would give it: dictionaries, arrays, strings, Doubles, Bools and NSNull.
  var any: Any {
    switch self {
    case .null: NSNull()
    case .bool(let b): b
    case .number(let n): n
    case .string(let s): s
    case .array(let a): a.map(\.any)
    case .object(let o): o.mapValues(\.any)
    }
  }
}

// MARK: - Canonical result

struct Canonical: Equatable, CustomStringConvertible {
  var issues: Set<ExpectedIssue>
  var nodes: [String: JSON]
  var state: [String: JSON]
  var mutations: [String: JSON]
  var missing: [String]

  var description: String {
    "issues: \(issues.sorted { ($0.line ?? .max, $0.code) < ($1.line ?? .max, $1.code) })\nnodes: \(JSON.object(nodes))\nstate: \(JSON.object(state))\nmutations: \(JSON.object(mutations))\nmissing: \(missing)"
  }
}

func json(_ p: Primitive) -> JSON {
  switch p {
  case .text(let s): .string(s)
  case .number(let n): .number(n)
  case .bool(let b): .bool(b)
  case .null: .null
  }
}

func json(_ v: PropValue) -> JSON {
  switch v {
  case .text(let s): .string(s)
  case .number(let n): .number(n)
  case .bool(let b): .bool(b)
  case .null: .null
  case .state(let key): .object(["state": .string(key)])
  case .ref(let id): .string(id)
  case .record(let r): .object(r.mapValues(json))
  case .list(let items): .array(items.map(json))
  }
}

func run(_ c: ConformanceCase, chunkSize: Int?) -> Canonical {
  let tools = Dictionary(uniqueKeysWithValues: (c.tools ?? ["payments.confirm"]).map { ($0, Tool.acceptsAnything) })
  let components = (try? c.components.map { try appComponents(fromJSONObject: $0.any) }) ?? AppComponents.none
  let pictures = (try? c.pictures.map { try picturePatterns(fromJSONObject: $0.any) }) ?? []
  let parser = OmniParser(tools: tools, assets: Set(c.assets ?? []), components: components, pictures: pictures)
  let text = c.text
  if let size = chunkSize {
    let bytes = Array(text.utf8)
    var at = 0
    while at < bytes.count {
      parser.write(bytes: bytes[at..<min(at + size, bytes.count)])
      at += size
    }
  } else {
    parser.write(text)
  }
  parser.end()
  let doc = parser.document
  return Canonical(
    issues: Set(parser.issues.map { ExpectedIssue(line: $0.line, code: $0.code.rawValue) }),
    // An app component (Step 20) is written by its own name, marked app: true.
    nodes: doc.nodes.mapValues { n in
      n.type == .app
        ? .object(["type": .string(n.appName ?? ""), "app": .bool(true), "props": .object(n.props.mapValues(json)), "children": .array(n.children.map(JSON.string))])
        : .object(["type": .string(n.type.rawValue), "props": .object(n.props.mapValues(json)), "children": .array(n.children.map(JSON.string))])
    },
    state: doc.state.mapValues(json),
    mutations: doc.mutations.mapValues { m in
      .object(["id": .string(m.id), "tool": .string(m.tool), "params": .object(m.params.mapValues(json))])
    },
    missing: doc.missing.sorted()
  )
}

// MARK: - Tests

@Suite("Conformance suite")
struct ConformanceTests {
  @Test("loads every case file")
  func loads() throws {
    let cases = try CaseFiles.load()
    #expect(cases.count >= 60)
    #expect(Set(cases.map(\.id)).count == cases.count, "case ids are unique")
  }

  @Test("gives the expected result, the same for every chunking", arguments: CaseFiles.cases)
  func conforms(_ c: ConformanceCase) {
    let whole = run(c, chunkSize: nil)
    for size in [1, 5, 13] {
      #expect(run(c, chunkSize: size) == whole, "chunks of \(size) bytes")
    }
    #expect(whole.issues == Set(c.expect.issues), "issues")
    if let nodes = c.expect.nodes { #expect(whole.nodes == nodes, "nodes") }
    if let state = c.expect.state { #expect(whole.state == state, "state") }
    if let mutations = c.expect.mutations { #expect(whole.mutations == mutations, "mutations") }
    if let missing = c.expect.missing { #expect(whole.missing == missing, "missing") }
  }

  // PLAN-HARDENING.md B.2: the Swift parser must reach exactly the TypeScript parser's result on
  // every generated stream. A disagreement is settled by SPEC.md and becomes a conformance case.
  @Test("loads the fuzz corpus")
  func loadsCorpus() throws {
    #expect(try CaseFiles.loadCorpus().count >= 1000)
  }

  @Test("agrees with the TypeScript parser on the fuzz corpus", arguments: CaseFiles.corpus)
  func agrees(_ c: ConformanceCase) {
    let whole = run(c, chunkSize: nil)
    #expect(run(c, chunkSize: 7) == whole, "chunks of 7 bytes")
    #expect(whole.issues == Set(c.expect.issues), "issues")
    if let nodes = c.expect.nodes { #expect(whole.nodes == nodes, "nodes") }
    if let state = c.expect.state { #expect(whole.state == state, "state") }
    if let mutations = c.expect.mutations { #expect(whole.mutations == mutations, "mutations") }
    if let missing = c.expect.missing { #expect(whole.missing == missing, "missing") }
  }
}
