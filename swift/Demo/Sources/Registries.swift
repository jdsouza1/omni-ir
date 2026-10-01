// The demo's registries, mirroring the web app's (app/tools.ts and app/assets.ts): the tools a
// screen may call, each checking its own params, and the pictures a screen may show.
import Foundation
import OmniIRSwiftUI
import SwiftUI

let demoTools: ToolRegistry = [
  "payments.confirm": Tool { p in
    problems([
      rule(number(p["amount"]).map { $0 > 0 } ?? false, "amount: must be a number above 0"),
      rule(text(p["note"]).map { $0.count <= 500 } ?? false, "note: must be text up to 500 characters"),
    ])
  },
  "auth.sendMagicLink": Tool { p in
    problems([rule(text(p["email"]).map { $0.contains("@") && $0.contains(".") } ?? false, "email: must be an email address")])
  },
  "profile.update": Tool { p in
    problems([
      rule(trimmed(p["displayName"]).map { (1...60).contains($0.count) } ?? false, "displayName: 1 to 60 characters"),
      rule(text(p["bio"]).map { $0.count <= 160 } ?? false, "bio: up to 160 characters"),
    ])
  },
  "orders.requestReturn": Tool { p in
    problems([rule(text(p["orderId"]).map { matches($0, #"^[A-Z0-9-]{4,32}$"#) } ?? false, "orderId: not a valid order number")])
  },
  "support.createTicket": Tool { p in
    problems([
      rule(trimmed(p["subject"]).map { (1...120).contains($0.count) } ?? false, "subject: 1 to 120 characters"),
      rule(trimmed(p["message"]).map { (1...2000).contains($0.count) } ?? false, "message: 1 to 2000 characters"),
    ])
  },
  "bookings.reserve": Tool { p in
    guard let checkIn = text(p["checkIn"]), let checkOut = text(p["checkOut"]),
      matches(checkIn, #"^\d{4}-\d{2}-\d{2}$"#), matches(checkOut, #"^\d{4}-\d{2}-\d{2}$"#)
    else { return ["checkIn and checkOut: dates written YYYY-MM-DD"] }
    return checkOut > checkIn ? [] : ["checkOut: must be after checkIn"]
  },
  "assistant.ask": Tool { p in
    problems([rule(trimmed(p["question"]).map { (1...500).contains($0.count) } ?? false, "question: 1 to 500 characters")])
  },
]

let demoPictureNames = ["cabin-pines", "shirt", "tote"]

/// The pictures, from the app's asset catalog (generated from app/assets.ts by `npm run swift:assets`).
@MainActor func demoPictures() -> [String: Image] {
  Dictionary(uniqueKeysWithValues: demoPictureNames.map { ($0, Image($0)) })
}

// MARK: - Helpers

/// nil when the check passes, the problem otherwise.
private func rule(_ ok: Bool, _ problem: String) -> String? {
  ok ? nil : problem
}

private func problems(_ results: [String?]) -> [String] {
  results.compactMap { $0 }
}

private func text(_ value: Primitive?) -> String? {
  if case .text(let s)? = value { return s }
  return nil
}

private func number(_ value: Primitive?) -> Double? {
  if case .number(let n)? = value { return n }
  return nil
}

private func trimmed(_ value: Primitive?) -> String? {
  text(value)?.trimmingCharacters(in: .whitespacesAndNewlines)
}

private func matches(_ s: String, _ pattern: String) -> Bool {
  s.range(of: pattern, options: .regularExpression) != nil
}

/// A fixture from the repo's fixtures/ folder, bundled with the app.
struct Fixture: Identifiable, Hashable {
  /// Path inside fixtures/ without the extension, such as "landing/booking".
  let id: String
  let title: String
  let group: String
  let url: URL

  static let groups = ["Screens", "Landing page examples", "Failure demos"]

  static func all() -> [Fixture] {
    guard let root = Bundle.main.url(forResource: "fixtures", withExtension: nil) else { return [] }
    let folders = [("", "Screens"), ("landing", "Landing page examples"), ("variants", "Failure demos")]
    return folders.flatMap { folder, group -> [Fixture] in
      let dir = folder.isEmpty ? root : root.appendingPathComponent(folder)
      let names = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
      return names.filter { $0.hasSuffix(".omni") }.sorted().map { file in
        let name = String(file.dropLast(".omni".count))
        let title = name.replacingOccurrences(of: "-", with: " ").capitalized(with: Locale(identifier: "en_US"))
        return Fixture(id: folder.isEmpty ? name : "\(folder)/\(name)", title: title, group: group, url: dir.appendingPathComponent(file))
      }
    }
  }
}
