// Live screens in the Swift client and store (SPEC.md [10.35]-[10.38]), on every platform: reading the
// feed's events, the `live` event, and updates applied through the store. The network calls run end to
// end in the iOS demo workflow.
import Foundation
import OmniIRCore
import Testing
@testable import OmniIRSwiftUI

@Suite("Live screens")
struct LiveTests {
  @Test("the feed's updates and end are read; anything malformed is skipped")
  func reader() {
    var reader = LiveReader()
    let text = "event: update\ndata: {\"seq\":1,\"text\":\"a = Divider()\\n\"}\n\n: ping\n\n"
      + "event: update\ndata: {\"seq\":\"2\",\"text\":\"x\"}\n\nevent: update\ndata: {\"seq\":1.5,\"text\":\"x\"}\n\n"
      + "event: other\ndata: {}\n\nevent: end\ndata: {}\n\n"
    #expect(reader.feed(Array(text.utf8)) == [.update(seq: 1, text: "a = Divider()\n"), .end])
  }

  @Test("a live event before done gives the outcome its screen [10.36]")
  func liveEvent() {
    var reader = StreamReader()
    _ = reader.feed(Array("event: chunk\ndata: {\"text\":\"root = Divider()\\n\"}\n\nevent: live\ndata: {\"screen\":\"scr_1\"}\n\nevent: done\ndata: {\"stopReason\":\"end_turn\",\"model\":\"m\",\"ms\":1}\n\n".utf8))
    #expect(reader.outcome == .done(stopReason: "end_turn", model: "m", milliseconds: 1, screen: "scr_1"))
  }

  @MainActor
  @Test("the store applies an update whole, and a Button replaced by a Notice loses its McpMutation [10.31]")
  func storeUpdate() {
    let store = OmniStore(tools: ["orders.requestReturn": .acceptsAnything])
    store.write("root = Card([order_status, ret])\norder_status = Badge(\"Shipped\")\nret = Button(\"Return\", action=\"go\")\ngo = McpMutation(ret, tool=\"orders.requestReturn\", params={orderId: \"A1\"})\n")
    store.end()
    #expect(store.update("order_status = Badge(\"Delivered\", tone=\"success\")\nret = Notice(\"Return requested\")\n").applied)
    #expect(store.document.nodes["ret"]?.type == .notice)
    #expect(store.document.mutations["ret"] == nil)
    #expect(store.document.lastUpdate?.count == 1)
    let rejected = store.update("order_status = Nope()\n")
    #expect(!rejected.applied)
    #expect(rejected.issues.map(\.code) == [.unknownComponent])
    // [8.8]: only the Notices an update adds or changes are read out.
    #expect(store.updateAnnouncement == "Return requested")
    store.update("order_status = Badge(\"Out again\")\n")
    #expect(store.updateAnnouncement == "")
  }
}
