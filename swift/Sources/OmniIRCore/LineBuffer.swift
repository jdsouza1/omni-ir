// R2: turns arbitrary network chunks into complete lines. Only complete lines leave this type; the
// unfinished remainder waits for more input. Port of packages/core/src/lineBuffer.ts.

enum LineEvent: Equatable {
  case line(text: String, number: Int)
  /// A line longer than the limit: it is dropped, up to its newline. `length` is in UTF-16 code units.
  case overflow(number: Int, length: Int)
}

struct LineBuffer {
  /// Longest line kept, in UTF-16 code units (as JavaScript measures strings), excluding the line ending.
  let maxLineLength: Int
  private var decoder = UTF8StreamDecoder()
  private var partial = String.UnicodeScalarView()
  private var partialLength = 0
  private var lineNumber = 1
  /// True while skipping the rest of an over-long line, up to its newline.
  private var discarding = false
  private(set) var ended = false

  init(maxLineLength: Int = Limits.lineLength) {
    self.maxLineLength = maxLineLength
  }

  mutating func push(_ text: String) -> [LineEvent] {
    consume(text.unicodeScalars)
  }

  mutating func push(bytes: some Collection<UInt8>) -> [LineEvent] {
    consume(decoder.decode(bytes, final: false).unicodeScalars)
  }

  mutating func end() -> [LineEvent] {
    if ended { return [] }
    var events = consume(decoder.decode([], final: true).unicodeScalars)
    ended = true
    if !discarding && !partial.isEmpty {
      events.append(.line(text: String(stripCR(partial)), number: lineNumber))
    }
    partial = String.UnicodeScalarView()
    partialLength = 0
    return events
  }

  private mutating func consume(_ text: String.UnicodeScalarView) -> [LineEvent] {
    var events: [LineEvent] = []
    var start = text.startIndex
    while let newline = text[start...].firstIndex(of: "\n") {
      let piece = text[start..<newline]
      if discarding {
        discarding = false
      } else {
        // The limit excludes the line ending, so measure after removing a \r from \r\n.
        var line = partial
        line.append(contentsOf: piece)
        let stripped = stripCR(line)
        let length = utf16Length(stripped)
        if length > maxLineLength {
          events.append(.overflow(number: lineNumber, length: length))
        } else {
          events.append(.line(text: String(stripped), number: lineNumber))
        }
      }
      partial = String.UnicodeScalarView()
      partialLength = 0
      lineNumber += 1
      start = text.index(after: newline)
    }
    if !discarding {
      let rest = text[start...]
      partial.append(contentsOf: rest)
      partialLength += utf16Length(rest)
      // A trailing \r may be the first half of a \r\n ending, so it doesn't count yet.
      let measured = partial.last == "\r" ? partialLength - 1 : partialLength
      if measured > maxLineLength {
        events.append(.overflow(number: lineNumber, length: measured))
        partial = String.UnicodeScalarView()
        partialLength = 0
        discarding = true
      }
    }
    return events
  }
}

private func stripCR(_ line: String.UnicodeScalarView) -> String.UnicodeScalarView {
  line.last == "\r" ? String.UnicodeScalarView(line.dropLast()) : line
}

func utf16Length(_ scalars: some Sequence<Unicode.Scalar>) -> Int {
  scalars.reduce(0) { $0 + UTF16.width($1) }
}

/// Decodes UTF-8 that arrives in pieces, as WHATWG's TextDecoder does in streaming mode: a character
/// split across chunks waits for the rest, invalid bytes become U+FFFD, and a byte order mark at the
/// very start is dropped.
struct UTF8StreamDecoder {
  private var held: [UInt8] = []
  private var atStart = true

  mutating func decode(_ bytes: some Collection<UInt8>, final: Bool) -> String {
    held.append(contentsOf: bytes)
    if atStart {
      let bom: [UInt8] = [0xEF, 0xBB, 0xBF]
      if !final && held.count < bom.count && held.elementsEqual(bom.prefix(held.count)) { return "" }
      if held.starts(with: bom) { held.removeFirst(bom.count) }
      atStart = false
    }
    let cut = final ? held.count : completeLength(held)
    let text = String(decoding: held[..<cut], as: UTF8.self)
    held.removeFirst(cut)
    return text
  }

  /// How many leading bytes can be decoded now: everything except a trailing sequence that is a valid
  /// start of a character whose remaining bytes haven't arrived yet.
  private func completeLength(_ bytes: [UInt8]) -> Int {
    var start = bytes.count - 1
    while start >= 0 && bytes.count - start < 4 && bytes[start] & 0xC0 == 0x80 { start -= 1 }
    guard start >= 0 else { return bytes.count }
    let lead = bytes[start]
    let needed: Int
    switch lead {
    case 0xC2...0xDF: needed = 2
    case 0xE0...0xEF: needed = 3
    case 0xF0...0xF4: needed = 4
    default: return bytes.count
    }
    let available = bytes.count - start
    guard available < needed else { return bytes.count }
    if available >= 2 {
      let second = bytes[start + 1]
      let range: ClosedRange<UInt8> = switch lead {
      case 0xE0: 0xA0...0xBF
      case 0xED: 0x80...0x9F
      case 0xF0: 0x90...0xBF
      case 0xF4: 0x80...0x8F
      default: 0x80...0xBF
      }
      guard range.contains(second) else { return bytes.count }
    }
    return start
  }
}
