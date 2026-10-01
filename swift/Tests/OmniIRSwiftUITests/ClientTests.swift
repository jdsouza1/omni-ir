// The streaming client's event handling, on every platform. The network calls themselves are tested
// end to end against the repo's Express server in the iOS demo workflow.
import Foundation
import Testing
@testable import OmniIRSwiftUI

@Suite("Server events")
struct ClientTests {
  @Test("blocks end with a blank line, however the bytes are split, with \\r\\n framing too")
  func framing() {
    let stream = "event: chunk\r\ndata: {\"text\":\"root = \"}\r\n\r\n: heartbeat\n\nevent: chunk\ndata: {\"text\":\"Divider()\\n\"}\n\nevent: done\ndata: {\"stopReason\":\"end_turn\",\"model\":\"mock\",\"ms\":12}\n\n"
    for size in [1, 3, 7, 1000] {
      var decoder = ServerEventDecoder()
      var events: [ServerEvent] = []
      let bytes = Array(stream.utf8)
      var at = 0
      while at < bytes.count {
        events += decoder.feed(bytes[at..<min(at + size, bytes.count)])
        at += size
      }
      #expect(events.map(\.event) == ["chunk", "chunk", "done"], "chunks of \(size)")
      #expect(events.map(interpret) == [
        .text("root = "), .text("Divider()\n"), .finished(.done(stopReason: "end_turn", model: "mock", milliseconds: 12)),
      ])
    }
  }

  @Test("an error event becomes an error outcome; unknown or malformed events are ignored")
  func errorsAndNoise() {
    #expect(interpret(ServerEvent(event: "error", data: #"{"code":"model_error","message":"The model failed.","retryable":true}"#))
      == .finished(.error(code: "model_error", message: "The model failed.", retryable: true)))
    #expect(interpret(ServerEvent(event: "error", data: "{}")) == .finished(.error(code: "server_error", message: "Something went wrong.", retryable: false)))
    #expect(interpret(ServerEvent(event: "chunk", data: "not json")) == .ignored)
    #expect(interpret(ServerEvent(event: "ping", data: "{}")) == .ignored)
  }

  @Test("data lines are joined with newlines, and an unfinished block at the end is dropped")
  func dataLines() {
    var decoder = ServerEventDecoder()
    let events = decoder.feed(Array("data: a\ndata: b\n\ndata: unfinished\n".utf8))
    #expect(events == [ServerEvent(event: "message", data: "a\nb")])
  }

  @Test("action params become JSON values")
  func params() throws {
    let json = try JSONSerialization.data(withJSONObject: jsonParams(["amount": .number(42.5), "note": .text("Hi"), "gift": .bool(false), "ref": .null]), options: .sortedKeys)
    #expect(String(decoding: json, as: UTF8.self) == #"{"amount":42.5,"gift":false,"note":"Hi","ref":null}"#)
  }
}
