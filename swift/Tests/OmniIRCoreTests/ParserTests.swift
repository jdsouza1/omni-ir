// Parser behaviour outside the conformance suite's scope: events, local state edits, and stream edges.
import Testing
@testable import OmniIRCore

private let tools: ToolRegistry = ["payments.confirm": .acceptsAnything]

@Suite("Parser")
struct ParserTests {
  @Test("a marker for a newer version flags the document, so the renderer can ask for an update")
  func newerVersion() {
    let newer = OmniParser(tools: tools)
    newer.write("# omni-ir 99.0\nroot = Divider()\n")
    newer.end()
    #expect(newer.document.newerVersion && newer.document.complete)
    #expect(Set(newer.document.nodes.keys) == ["root"])
    let same = OmniParser(tools: tools)
    same.write("# omni-ir \(omniIRFormatVersion)\nroot = Divider()\n")
    #expect(!same.document.newerVersion)
    // Format 0.8 added field constraints; releases 0.6 and 0.7 mean format 0.5. The next format is 0.9.
    #expect(!isNewerMarker("# omni-ir 0.8"))
    #expect(!isNewerMarker("# omni-ir 0.7"))
    #expect(isNewerMarker("# omni-ir 0.9"))
    #expect(!isNewerMarker("# omni-ir 0.7", format: "0.5"))
    #expect(omniIRFormatVersion == "0.8")
  }

  @Test("reports pending references and resolves them as their lines arrive")
  func pendingAndResolved() {
    let parser = OmniParser(tools: tools)
    var events: [ParserEvent] = []
    parser.onEvent = { events.append($0) }
    parser.write("root = Card([title])\n")
    #expect(parser.document.pending == ["title"])
    parser.write("title = Heading(\"Hi\")\n")
    parser.end()
    #expect(events == [
      .node(id: "root", line: 1), .pending(id: "title", line: 1),
      .node(id: "title", line: 2), .resolved(id: "title", line: 2),
      .end([]),
    ])
    #expect(parser.document.complete && parser.document.missing.isEmpty)
  }

  @Test("an Input's state can be edited locally, but undeclared keys cannot be created")
  func setState() {
    let parser = OmniParser(tools: tools)
    var changes = 0
    parser.onChange = { _ in changes += 1 }
    parser.write("root = Input($note, label=\"Note\")\n$note = \"\"\n")
    let before = changes
    parser.setState("$note", .text("hello"))
    #expect(parser.document.state["$note"] == .text("hello"))
    parser.setState("$note", .text("hello"))  // unchanged: no notification
    parser.setState("$other", .text("x"))  // never declared: ignored
    #expect(parser.document.state["$other"] == nil)
    #expect(changes == before + 1)
  }

  @Test("writing after end() is ignored, and end() returns the same issues again")
  func afterEnd() {
    let parser = OmniParser(tools: tools)
    let issues = parser.end()
    #expect(issues.map(\.code) == [.missingRoot])
    parser.write("root = Divider()\n")
    #expect(parser.document.nodes.isEmpty)
    #expect(parser.end() == issues)
  }

  @Test("a byte order mark at the start of a byte stream is dropped, even when split")
  func byteOrderMark() {
    let parser = OmniParser(tools: tools)
    for byte in [0xEF, 0xBB, 0xBF] as [UInt8] { parser.write(bytes: [byte]) }
    parser.write(bytes: Array("root = Divider()\n".utf8))
    #expect(parser.end().isEmpty)
    #expect(parser.document.nodes["root"]?.type == .divider)
  }

  @Test("invalid UTF-8 becomes U+FFFD; a character split across chunks is kept whole")
  func utf8() {
    let parser = OmniParser(tools: tools)
    let bytes = Array("root = Text(\"é\u{FFFF}".utf8).dropLast(3) + [0xFF] + Array("\")\n".utf8)
    let split = Array(bytes)
    parser.write(bytes: split[..<14])  // ends after the first byte of "é"
    parser.write(bytes: split[14...])
    parser.end()
    #expect(parser.document.nodes["root"]?.props["text"] == .text("é\u{FFFD}"))
  }
}
