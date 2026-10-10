// Runs the field-check conformance cases (conformance/fields/fields.json, SPEC.md section 8, Fields)
// against the Swift checks: the same file the web and Kotlin renderers are held to.
import Foundation
import Testing
@testable import OmniIRCore

struct FieldCase: Sendable, Decodable, CustomTestStringConvertible {
  struct Expect: Sendable, Decodable, Equatable {
    let message: String
    let values: [String: JSON]?
  }
  let id: String
  let description: String
  let component: String
  let props: [String: JSON]
  let value: JSON
  let expect: Expect?

  var testDescription: String { id }
}

private func loadFieldCases() -> [FieldCase] {
  struct File: Decodable { let cases: [FieldCase] }
  let url = repoRoot.appendingPathComponent("conformance/fields/fields.json")
  guard let data = try? Data(contentsOf: url), let file = try? JSONDecoder().decode(File.self, from: data) else { return [] }
  return file.cases
}

private func propValue(_ json: JSON) -> PropValue {
  switch json {
  case .null: .null
  case .bool(let b): .bool(b)
  case .number(let n): .number(n)
  case .string(let s): .text(s)
  case .array(let a): .list(a.map(propValue))
  case .object: .null
  }
}

private func primitive(_ json: JSON) -> Primitive {
  switch json {
  case .bool(let b): .bool(b)
  case .number(let n): .number(n)
  case .string(let s): .text(s)
  default: .null
  }
}

/// Values as text, so 3 and "3" don't differ by type.
private func text(_ json: JSON) -> String {
  if case .string(let s) = json { return s }
  return json.description
}

@Suite struct FieldsConformanceTests {
  @Test func findsTheCases() {
    #expect(loadFieldCases().count >= 40, "field cases not found")
  }

  @Test(arguments: loadFieldCases())
  func fieldCase(_ c: FieldCase) throws {
    let type = try #require(ComponentType(rawValue: c.component))
    let problem = checkField(type, props: c.props.mapValues(propValue), value: primitive(c.value))
    let expected = c.expect.map { FieldProblem($0.message, ($0.values ?? [:]).mapValues(text)) }
    #expect(problem == expected, "\(c.description)")
  }

  @Test func theFieldsAGovernedButtonReadsInTheOrderTheirLinesArrived() {
    let parser = OmniParser(tools: ["support.createTicket": .acceptsAnything])
    parser.write("""
      root = Card([email, search, note, send])
      $email = ""
      email = Input($email, label="Email", required=true, format="email")
      $q = ""
      search = Input($q, label="Search", required=true)
      $msg = ""
      note = Input($msg, label="Message", required=true, lines=4)
      send = Button("Send", action="go")
      go = McpMutation(send, tool="support.createTicket", params={subject: $email, message: $msg})

      """)
    let doc = parser.document
    guard let mutation = doc.mutations["send"] else { Testing.Issue.record("no McpMutation"); return }
    #expect(fieldsReadBy(mutation, in: doc) == ["email", "note"])
  }
}
