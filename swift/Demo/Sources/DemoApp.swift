// The Omni-IR demo app: pick any screen from the repo's fixtures and watch it stream in, offline.
// Mock data only: nothing is sent anywhere, and actions are logged with a stub result.
//
// Launch options (used by the UI tests): `-fixture landing/booking` opens a screen directly,
// `-appearance dark` forces dark mode, `-instant YES` writes the whole screen at once.
import OmniIRSwiftUI
import SwiftUI

@main
struct OmniIRDemoApp: App {
  var body: some Scene {
    WindowGroup { RootView() }
  }
}

struct RootView: View {
  @State private var path: [Fixture] = []
  private let fixtures = Fixture.all()
  private let options = UserDefaults.standard

  var body: some View {
    NavigationStack(path: $path) {
      List {
        ForEach(Fixture.groups, id: \.self) { group in
          Section(group) {
            ForEach(fixtures.filter { $0.group == group }) { fixture in
              NavigationLink(fixture.title, value: fixture)
            }
          }
        }
      }
      .navigationTitle("Omni-IR")
      .navigationDestination(for: Fixture.self) { ScreenView(fixture: $0, instant: options.bool(forKey: "instant")) }
    }
    .preferredColorScheme(appearance)
    .onAppear {
      if let name = options.string(forKey: "fixture"), let fixture = fixtures.first(where: { $0.id == name }) {
        path = [fixture]
      }
    }
  }

  private var appearance: ColorScheme? {
    switch options.string(forKey: "appearance") {
    case "dark": .dark
    case "light": .light
    default: nil
    }
  }
}

/// One fixture, streamed into an OmniView.
struct ScreenView: View {
  let fixture: Fixture
  let instant: Bool
  @State private var store = OmniStore(tools: demoTools, assets: Set(demoPictureNames))
  @State private var log: [String] = []
  @State private var done = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        OmniView(
          store: store,
          pictures: demoPictures(),
          onMutation: { call in
            log.append("Sent \(call.tool) \(describe(call.params)): stub result, nothing left the device")
          },
          onEvent: { event in
            switch event {
            case .press(let id): log.append("Pressed \(id) (local only)")
            case .error(let issue): log.append("\(issue.code.rawValue): \(issue.message)")
            }
          }
        )
        if !log.isEmpty {
          section("Actions", lines: log)
        }
        if !store.issues.isEmpty {
          section("Issues", lines: store.issues.map { "\($0.line.map { "Line \($0)" } ?? "End"): \($0.code.rawValue)" })
        }
        Text(done ? "Done" : "Streaming…")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("status")
      }
      .padding()
    }
    .background(Color(uiColor: .systemGroupedBackground))
    .navigationTitle(fixture.title)
    .navigationBarTitleDisplayMode(.inline)
    .task { await stream() }
  }

  private func section(_ title: String, lines: [String]) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title).font(.headline)
      ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
        Text(verbatim: line).font(.footnote.monospaced()).frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }

  /// Writes the fixture in small random chunks with short pauses, like a model streaming its reply.
  private func stream() async {
    guard !done, store.document.nodes.isEmpty else { return }
    let text = (try? String(contentsOf: fixture.url, encoding: .utf8)) ?? ""
    if instant {
      store.write(text)
    } else {
      var rest = Substring(text)
      while !rest.isEmpty {
        let chunk = rest.prefix(Int.random(in: 4...24))
        store.write(String(chunk))
        rest = rest.dropFirst(chunk.count)
        try? await Task.sleep(for: .milliseconds(35))
      }
    }
    store.end()
    done = true
  }
}

private func describe(_ params: [String: Primitive]) -> String {
  let items = params.keys.sorted().map { key -> String in
    switch params[key] {
    case .text(let s)?: "\(key): \"\(s)\""
    case let value?: "\(key): \(displayText(value))"
    case nil: key
    }
  }
  return "{\(items.joined(separator: ", "))}"
}
