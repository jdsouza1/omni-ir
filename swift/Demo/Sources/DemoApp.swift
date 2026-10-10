// The Omni-IR demo app: pick any screen from the repo's fixtures and watch it stream in, offline.
// Mock data only: nothing is sent anywhere, and actions are logged with a stub result.
//
// Launch options (used by the UI tests): `-fixture landing/booking` opens a screen directly,
// `-appearance dark` forces dark mode, `-instant YES` writes the whole screen at once, and
// `-server http://localhost:8787 -prompt "book a stay"` streams from a running Omni-IR server
// (`npm run server`, free mock model) instead of a fixture. `-video YES` is the demo video's recording
// mode (PLAN-VIDEO.md): only the screen shows, without the developer log or issue codes.
import OmniIRSwiftUI
import SwiftUI

@main
struct OmniIRDemoApp: App {
  var body: some Scene {
    WindowGroup { RootView() }
  }
}

/// Where a screen comes from: a bundled fixture, or a prompt sent to an Omni-IR server.
enum Source: Hashable {
  case fixture(Fixture)
  case server(URL, prompt: String)

  var title: String {
    switch self {
    case .fixture(let f): f.title
    case .server(_, let prompt): prompt
    }
  }
}

struct RootView: View {
  @State private var path: [Source] = []
  @State private var serverURL = "http://localhost:8787"
  @State private var prompt = "book a stay"
  private let fixtures = Fixture.all()
  private let options = UserDefaults.standard

  var body: some View {
    NavigationStack(path: $path) {
      List {
        ForEach(Fixture.groups, id: \.self) { group in
          Section(group) {
            ForEach(fixtures.filter { $0.group == group }) { fixture in
              NavigationLink(fixture.title, value: Source.fixture(fixture))
            }
          }
        }
        Section {
          TextField("Server", text: $serverURL).textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
          TextField("Describe a screen", text: $prompt)
          Button("Ask the server") {
            if let url = URL(string: serverURL) { path.append(.server(url, prompt: prompt)) }
          }
        } header: {
          Text("Live server")
        } footer: {
          Text("Start one with npm run server (free mock model).")
        }
      }
      .navigationTitle("Omni-IR")
      .navigationDestination(for: Source.self) { ScreenView(source: $0, instant: options.bool(forKey: "instant")) }
    }
    .preferredColorScheme(appearance)
    .onAppear {
      if let name = options.string(forKey: "fixture"), let fixture = fixtures.first(where: { $0.id == name }) {
        path = [.fixture(fixture)]
      } else if let server = options.string(forKey: "server").flatMap(URL.init(string:)) {
        path = [.server(server, prompt: options.string(forKey: "prompt") ?? prompt)]
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

/// One screen, streamed into an OmniView from a fixture or a server.
struct ScreenView: View {
  let source: Source
  let instant: Bool
  @State private var store = OmniStore(
    tools: demoTools, assets: Set(demoPictureNames), confirm: demoConfirm,
    components: DemoComponentRegistry.bundled.components, pictures: DemoComponentRegistry.bundled.pictures
  )
  @State private var log: [String] = []
  @State private var done = false
  private let video = UserDefaults.standard.bool(forKey: "video")

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        OmniView(
          store: store,
          pictures: demoPictures(),
          onMutation: mutationHandler,
          onEvent: { event in
            switch event {
            case .press(let id): log.append("Pressed \(id) (local only)")
            case .error(let issue): log.append("\(issue.code.rawValue): \(issue.message)")
            }
          },
          appViews: demoAppViews,
          resolvePicture: { name in DemoComponentRegistry.bundled.productPictures[name].map { Image($0) } }
        )
        if !video && !log.isEmpty {
          section("Actions", lines: log)
        }
        if !video && !store.issues.isEmpty {
          section("Issues", lines: store.issues.map { "\($0.line.map { "Line \($0)" } ?? "End"): \($0.code.rawValue)" })
        }
        Text(done ? "Done" : "Streaming…")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("status")
          .opacity(video ? 0 : 1)  // still there for the tests in recording mode, but not seen
      }
      .padding()
    }
    .background(Color(uiColor: .systemGroupedBackground))
    .navigationTitle(source.title)
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

  /// Fixtures log the action with a stub result; a server runs it (and checks it again).
  private var mutationHandler: @MainActor (MutationCall) async throws -> Void {
    switch source {
    case .fixture:
      return { call in log.append("Sent \(call.tool) \(describe(call.params)): stub result, nothing left the device") }
    case .server(let url, _):
      // An action's result may update the screen where its Button was (SPEC.md [10.35]).
      let store = store
      let send = OmniClient(baseURL: url).mutationHandler(onUpdate: { text, _ in _ = store.update(text) }) { call, result in
        log.append("Sent \(call.tool) \(describe(call.params)). Server result: \(String(decoding: result, as: UTF8.self))")
      }
      return send
    }
  }

  private func stream() async {
    guard !done, store.document.nodes.isEmpty else { return }
    switch source {
    case .fixture(let fixture): await streamFixture(fixture)
    case .server(let url, let prompt):
      let client = OmniClient(baseURL: url)
      let outcome = await client.generate(prompt, into: store)
      if case .error(let code, let message, _) = outcome { log.append("\(code): \(message)") }
      done = true
      // A screen the server keeps current (the order moving on): follow it while this view is shown ([10.37]).
      if case .done(_, _, _, let screen?) = outcome {
        _ = await client.follow(screen, into: store) { result, _ in
          if !result.applied { log.append("Update rejected: \(result.issues.map(\.code.rawValue).joined(separator: ", "))") }
        }
      }
    }
  }

  /// Writes the fixture in small random chunks with short pauses, like a model streaming its reply.
  private func streamFixture(_ fixture: Fixture) async {
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
