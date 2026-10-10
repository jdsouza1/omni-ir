// Client for an Omni-IR server such as the repo's reference server (server/): `POST /api/generate`
// streams a screen as server-sent events, and `POST /api/mutate` runs a governed action, which the
// server checks again. Port of packages/react/src/client (generate.ts, mutate.ts).
//
// The event decoding below is plain Swift and tested on every platform. The network calls use
// URLSession's streaming API, which exists only on Apple platforms.
import Foundation
import OmniIRCore

/// How a `generate` call ended.
public enum GenerateOutcome: Sendable, Equatable {
  /// The stream finished. `stopReason` is "end_turn", "max_tokens" or "refusal". `screen`: the server
  /// keeps this screen current; pass it to `follow` (SPEC.md [10.36]).
  case done(stopReason: String, model: String, milliseconds: Double, screen: String? = nil)
  /// The server or the connection failed; `retryable` says whether trying again may help.
  case error(code: String, message: String, retryable: Bool)
  /// The caller cancelled.
  case aborted
}

/// The server refused an action, with its message.
/// How following a screen ended (SPEC.md [10.37]-[10.39]).
public enum FollowOutcome: Sendable, Equatable {
  /// The server sent `end`: the screen won't change again.
  case ended
  case aborted
  /// The server refused for good: `not_found`, or another error that isn't retryable.
  case failed(code: String, message: String)
}

public struct MutationRejectedError: Error, Sendable, Equatable, CustomStringConvertible {
  public let message: String
  public var description: String { message }
}

// MARK: - Server-sent events

/// One server-sent event: its name and its (joined) data lines.
struct ServerEvent: Equatable {
  let event: String
  let data: String
}

/// Splits a byte stream into server-sent events. Blocks end with a blank line; `\r\n` counts as `\n`;
/// comment lines (`:`) are skipped. An unfinished block at the end of the stream is dropped.
struct ServerEventDecoder {
  private var buffer: [UInt8] = []

  mutating func feed(_ bytes: some Sequence<UInt8>) -> [ServerEvent] {
    for byte in bytes {
      if byte == 0x0A, buffer.last == 0x0D { buffer[buffer.count - 1] = 0x0A } else { buffer.append(byte) }
    }
    var events: [ServerEvent] = []
    while let end = blockEnd() {
      let block = String(decoding: buffer[..<end], as: UTF8.self)
      buffer.removeFirst(end + 2)
      if let event = parse(block) { events.append(event) }
    }
    return events
  }

  private func blockEnd() -> Int? {
    guard buffer.count >= 2 else { return nil }
    for i in 0..<(buffer.count - 1) where buffer[i] == 0x0A && buffer[i + 1] == 0x0A { return i }
    return nil
  }

  private func parse(_ block: String) -> ServerEvent? {
    var event = "message"
    var data: [String] = []
    for line in block.split(separator: "\n", omittingEmptySubsequences: false) {
      if line.hasPrefix(":") { continue }  // comment, e.g. a heartbeat
      if line.hasPrefix("event:") {
        event = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
      } else if line.hasPrefix("data:") {
        var value = line.dropFirst(5)
        if value.first == " " { value = value.dropFirst() }
        data.append(String(value))
      }
    }
    return data.isEmpty ? nil : ServerEvent(event: event, data: data.joined(separator: "\n"))
  }
}

/// What one event means for a `generate` call: text for the parser, or how the call ended.
enum StreamStep: Equatable {
  case text(String)
  case finished(GenerateOutcome)
  /// The id of a screen the server keeps current ([10.36]).
  case live(String)
  case ignored
}

func interpret(_ event: ServerEvent) -> StreamStep {
  guard let object = try? JSONSerialization.jsonObject(with: Data(event.data.utf8)), let payload = object as? [String: Any] else {
    return .ignored  // not ours to interpret
  }
  switch event.event {
  case "chunk":
    return (payload["text"] as? String).map(StreamStep.text) ?? .ignored
  case "done":
    return .finished(.done(
      stopReason: payload["stopReason"] as? String ?? "end_turn",
      model: payload["model"].map { "\($0)" } ?? "",
      milliseconds: (payload["ms"] as? NSNumber)?.doubleValue ?? 0))
  case "error":
    return .finished(errorOutcome(payload))
  case "live":
    guard let screen = payload["screen"] as? String, !screen.isEmpty else { return .ignored }
    return .live(screen)
  default:
    return .ignored
  }
}

/// One step of a live feed ([10.37]).
enum LiveStep: Equatable {
  case update(seq: Int, text: String)
  case end
}

/// The events of one `GET /api/live` response, read as [10.6] says; anything else is skipped.
struct LiveReader {
  private var decoder = ServerEventDecoder()

  mutating func feed(_ bytes: some Sequence<UInt8>) -> [LiveStep] {
    decoder.feed(bytes).compactMap { event in
      guard let object = try? JSONSerialization.jsonObject(with: Data(event.data.utf8)), let payload = object as? [String: Any] else { return nil }
      switch event.event {
      case "end":
        return .end
      case "update":
        guard let number = payload["seq"] as? NSNumber, let text = payload["text"] as? String else { return nil }
        let seq = number.doubleValue
        guard seq >= 1, seq == seq.rounded(), seq < Double(Int32.max) else { return nil }
        return .update(seq: Int(seq), text: text)
      default:
        return nil
      }
    }
  }
}

/// The events of one `generate` response (SPEC.md [10.6]-[10.9]): `feed` returns the text to write to
/// the parser, and `outcome` is set by the first terminal event, after which everything is ignored.
struct StreamReader {
  private var decoder = ServerEventDecoder()
  private(set) var outcome: GenerateOutcome?
  private var screen: String?

  mutating func feed(_ bytes: some Sequence<UInt8>) -> [String] {
    var texts: [String] = []
    for event in decoder.feed(bytes) {
      if outcome != nil { break }
      switch interpret(event) {
      case .text(let text): texts.append(text)
      case .live(let id): screen = id
      case .finished(let result):
        if case .done(let stopReason, let model, let milliseconds, _) = result {
          outcome = .done(stopReason: stopReason, model: model, milliseconds: milliseconds, screen: screen)
        } else {
          outcome = result
        }
      case .ignored: break
      }
    }
    return texts
  }

  /// How the call ended once the response is over: without a terminal event, the connection was lost.
  func finish() -> GenerateOutcome { outcome ?? connectionLost }
}

/// An error status before the stream started ([10.3]): the body's error, or `server_error`.
func errorResponseOutcome(status: Int, body: [UInt8]) -> GenerateOutcome {
  let json = (try? JSONSerialization.jsonObject(with: Data(body))) as? [String: Any]
  if let error = json?["error"] as? [String: Any] { return errorOutcome(error) }
  return .error(code: "server_error", message: "Request failed (\(status)).", retryable: status >= 500)
}


func errorOutcome(_ payload: [String: Any]?) -> GenerateOutcome {
  .error(
    code: payload?["code"] as? String ?? "server_error",
    message: payload?["message"] as? String ?? "Something went wrong.",
    retryable: payload?["retryable"] as? Bool ?? false)
}

let connectionLost = GenerateOutcome.error(code: "connection_lost", message: "The connection closed before the screen finished.", retryable: true)

/// An action's params as JSON values.
func jsonParams(_ params: [String: Primitive]) -> [String: Any] {
  params.mapValues { value -> Any in
    switch value {
    case .text(let s): s
    case .number(let n): n
    case .bool(let b): b
    case .null: NSNull()
    }
  }
}

// MARK: - Network (Apple platforms)

#if canImport(Darwin)
public struct OmniClient: Sendable {
  /// The server's origin, such as `https://example.com` or `http://localhost:8787`.
  public let baseURL: URL
  public let session: URLSession
  /// With no bytes for this long, pings included, the stream counts as lost (SPEC.md [10.10]).
  public let idleTimeout: TimeInterval
  /// The signed-in person's session token, sent as `Authorization: Bearer …` (SPEC.md [10.14]); nil when signed out.
  public let token: @Sendable () -> String?

  public init(baseURL: URL, session: URLSession = .shared, idleTimeout: TimeInterval = 45, token: @escaping @Sendable () -> String? = { nil }) {
    self.baseURL = baseURL
    self.session = session
    self.idleTimeout = idleTimeout
    self.token = token
  }

  private func generateRequest(_ prompt: String, withVersion: Bool) -> URLRequest {
    var components = URLComponents(url: baseURL.appendingPathComponent("api/generate"), resolvingAgainstBaseURL: false)
    if withVersion { components?.queryItems = [URLQueryItem(name: "version", value: omniIRFormatVersion)] }
    var request = URLRequest(url: components?.url ?? baseURL.appendingPathComponent("api/generate"))
    request.httpMethod = "POST"
    request.timeoutInterval = idleTimeout  // URLSession's timeout is the longest wait between bytes
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    request.setValue("text/event-stream", forHTTPHeaderField: "accept")
    if let token = token() { request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
    request.httpBody = try? JSONSerialization.data(withJSONObject: ["prompt": prompt])
    return request
  }

  /// Asks the server for a screen and writes it into `store` as it streams. The store is always ended
  /// once the stream has started (done, error, cancelled or dropped), so anything that never arrived
  /// becomes a fallback instead of loading forever. Cancel the task to stop.
  @MainActor
  public func generate(_ prompt: String, into store: OmniStore) async -> GenerateOutcome {
    // Ask for this package's format (SPEC.md [10.1]). A server that compares versions exactly (0.6 and
    // 0.7 did) refuses a different number; one retry without a version gets the stream, and the parser's
    // marker check decides whether the screen needs a newer app ([10.12], [3.9]).
    var opened: URLSession.AsyncBytes?
    for withVersion in [true, false] {
      let bytes: URLSession.AsyncBytes
      let response: URLResponse
      do {
        (bytes, response) = try await session.bytes(for: generateRequest(prompt, withVersion: withVersion))
      } catch {
        return Task.isCancelled ? .aborted : .error(code: "network_error", message: "Could not reach the server.", retryable: true)
      }
      // Errors before the stream starts (bad request, rate limit): the store is left untouched.
      guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
        var body: [UInt8] = []
        do { for try await byte in bytes { body.append(byte) } } catch {}
        let refused = errorResponseOutcome(status: (response as? HTTPURLResponse)?.statusCode ?? 0, body: body)
        if withVersion, case .error(let code, _, _) = refused, code == "unsupported_version" { continue }
        return refused
      }
      opened = bytes
      break
    }
    guard let bytes = opened else {
      return .error(code: "unsupported_version", message: "The server can't write a stream this app can read.", retryable: false)
    }

    var reader = StreamReader()
    var line: [UInt8] = []
    do {
      for try await byte in bytes {
        line.append(byte)
        guard byte == 0x0A else { continue }
        for text in reader.feed(line) { store.write(text) }
        line.removeAll(keepingCapacity: true)
      }
    } catch {
      store.end()
      return Task.isCancelled ? .aborted : connectionLost
    }
    store.end()
    return Task.isCancelled && reader.outcome == nil ? .aborted : reader.finish()
  }

  /// An `onMutation` handler for OmniView that posts governed actions to `/api/mutate`. The server
  /// checks the tool and params again. A refusal throws `MutationRejectedError`, which the renderer
  /// reports as `handler_failed`. `onResult` gets the server's result as JSON.
  /// `onUpdate` gets the update a successful action's result carries ([10.35]), to apply to the screen the
  /// Button was on: usually `{ text, _ in store.update(text) }`. The pressed Button's id is sent so the
  /// server can write the update for it.
  public func mutationHandler(
    onUpdate: (@MainActor (String, MutationCall) -> Void)? = nil,
    onResult: (@MainActor (MutationCall, Data) -> Void)? = nil
  ) -> @MainActor (MutationCall) async throws -> Void {
    let url = baseURL.appendingPathComponent("api/mutate")
    let session = session
    let token = token
    return { call in
      var request = URLRequest(url: url)
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "content-type")
      // One key per press, kept for the retry, so a server that honours keys never runs it twice.
      request.setValue(UUID().uuidString, forHTTPHeaderField: "idempotency-key")
      if let token = token() { request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
      var body: [String: Any] = ["tool": call.tool, "params": jsonParams(call.params)]
      if onUpdate != nil { body["button"] = call.target }
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
      let data: Data
      let response: URLResponse
      do {
        (data, response) = try await session.data(for: request)
      } catch {
        do {
          (data, response) = try await session.data(for: request)
        } catch {
          throw MutationRejectedError(message: "Could not reach the server.")
        }
      }
      let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
      guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
        let message = (json?["error"] as? [String: Any])?["message"] as? String
        throw MutationRejectedError(message: message ?? "The action failed (\((response as? HTTPURLResponse)?.statusCode ?? 0)).")
      }
      let result = json?["result"].flatMap { try? JSONSerialization.data(withJSONObject: $0) } ?? Data("{}".utf8)
      onResult?(call, result)
      if let update = json?["update"] as? String { onUpdate?(update, call) }
    }
  }

  /// Follows a screen the server keeps current ([10.37]-[10.39]): applies each update to `store`, in
  /// order, until the server says the screen won't change again or the task is cancelled. A dropped
  /// connection is followed again from the last update received, waiting longer each time, up to a minute.
  /// `onUpdate` gets each result; a rejected update is a bug in the app's code.
  @MainActor
  public func follow(
    _ screen: String, into store: OmniStore, retry: TimeInterval = 1, onUpdate: (@MainActor (UpdateResult, Int) -> Void)? = nil
  ) async -> FollowOutcome {
    var last = 0
    var failures = 0
    while !Task.isCancelled {
      var gotSomething = false
      var components = URLComponents(url: baseURL.appendingPathComponent("api/live"), resolvingAgainstBaseURL: false)
      components?.queryItems = [URLQueryItem(name: "screen", value: screen), URLQueryItem(name: "after", value: String(last))]
      var request = URLRequest(url: components?.url ?? baseURL.appendingPathComponent("api/live"))
      request.timeoutInterval = idleTimeout
      request.setValue("text/event-stream", forHTTPHeaderField: "accept")
      if let token = token() { request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
      do {
        let (bytes, response) = try await session.bytes(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
          var body: [UInt8] = []
          do { for try await byte in bytes { body.append(byte) } } catch {}
          if case .error(let code, let message, let retryable) = errorResponseOutcome(status: http.statusCode, body: body), !retryable {
            return .failed(code: code, message: message)
          }
        } else {
          var reader = LiveReader()
          var line: [UInt8] = []
          for try await byte in bytes {
            line.append(byte)
            guard byte == 0x0A else { continue }
            for step in reader.feed(line) {
              gotSomething = true
              switch step {
              case .end:
                return .ended
              case .update(let seq, let text) where seq > last:
                last = seq  // a rejected update still counts as received ([10.38])
                onUpdate?(store.update(text), seq)
              case .update:
                continue
              }
            }
            line.removeAll(keepingCapacity: true)
          }
        }
      } catch {
        // dropped: follow again below
      }
      if Task.isCancelled { break }
      failures = gotSomething ? 0 : failures + 1
      let wait = min(60, retry * pow(2, Double(max(0, failures - 1))))
      try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
    }
    return .aborted
  }
}
#endif
