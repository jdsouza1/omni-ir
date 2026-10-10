// Runs the transport conformance cases (conformance/transport/*.json, SPEC.md section 10) against the
// client's stream handling, with each case's response split into reads of several sizes.
import Foundation
import Testing
@testable import OmniIRSwiftUI

private let repoRoot = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

struct TransportCase: Decodable, Sendable, CustomTestStringConvertible {
  enum Body: Decodable, Sendable {
    case text(String)
    case parts([String])
    init(from decoder: Decoder) throws {
      let container = try decoder.singleValueContainer()
      if let text = try? container.decode(String.self) { self = .text(text) } else { self = .parts(try container.decode([String].self)) }
    }
    var bytes: [UInt8] {
      switch self {
      case .text(let text): Array(text.utf8)
      case .parts(let parts): Array(parts.joined().utf8)
      }
    }
  }
  struct Response: Decodable, Sendable {
    let status: Int
    let body: Body
  }
  struct Outcome: Decodable, Sendable {
    let status: String
    let stopReason: String?
    let model: String?
    let ms: Double?
    let code: String?
    let retryable: Bool?
  }
  struct Expect: Decodable, Sendable {
    let written: String
    let ended: Bool
    let outcome: Outcome
  }
  let id: String
  let response: Response
  let expect: Expect
  var testDescription: String { id }
}

private func loadTransportCases() throws -> [TransportCase] {
  struct File: Decodable { let cases: [TransportCase] }
  let dir = repoRoot.appendingPathComponent("conformance/transport")
  let names = try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { $0.hasSuffix(".json") }.sorted()
  return try names.flatMap { try JSONDecoder().decode(File.self, from: Data(contentsOf: dir.appendingPathComponent($0))).cases }
}

private func run(_ c: TransportCase, size: Int?) -> (written: String, ended: Bool, outcome: GenerateOutcome) {
  let body = c.response.body.bytes
  guard (200..<300).contains(c.response.status) else {
    return ("", false, errorResponseOutcome(status: c.response.status, body: body))
  }
  var reader = StreamReader()
  var written = ""
  let step = size ?? max(body.count, 1)
  var at = 0
  while at < body.count {
    for text in reader.feed(body[at..<min(at + step, body.count)]) { written += text }
    at += step
  }
  return (written, true, reader.finish())
}

@Suite("Transport conformance")
struct TransportConformanceTests {
  @Test("the cases are present")
  func present() throws {
    #expect(try loadTransportCases().count >= 20)
  }

  @Test("each case gives the expected result however the body is split", arguments: (try? loadTransportCases()) ?? [])
  func transportCase(_ c: TransportCase) {
    for size in [nil, 1, 5, 13] as [Int?] {
      let result = run(c, size: size)
      let label = Comment(rawValue: "reads of \(size.map(String.init) ?? "all") bytes")
      #expect(result.written == c.expect.written, label)
      #expect(result.ended == c.expect.ended, label)
      let expected = c.expect.outcome
      switch result.outcome {
      case .done(let stopReason, let model, let milliseconds, _):
        #expect(expected.status == "done", label)
        if let value = expected.stopReason { #expect(stopReason == value, label) }
        if let value = expected.model { #expect(model == value, label) }
        if let value = expected.ms { #expect(milliseconds == value, label) }
      case .error(let code, _, let retryable):
        #expect(expected.status == "error", label)
        #expect(code == expected.code, label)
        #expect(retryable == expected.retryable, label)
      case .aborted:
        Issue.record("aborted")
      }
    }
  }
}
