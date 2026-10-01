// R2: turns arbitrary network chunks into complete lines. Only complete lines leave this class; the
// unfinished remainder waits for more input. Port of packages/core/src/lineBuffer.ts.
package dev.omniir.core

internal sealed interface LineEvent {
  data class Line(val text: String, val number: Int) : LineEvent

  /** A line longer than the limit: it is dropped, up to its newline. `length` is in UTF-16 code units. */
  data class Overflow(val number: Int, val length: Int) : LineEvent
}

internal class LineBuffer(private val maxLineLength: Int = Limits.LINE_LENGTH) {
  private val decoder = Utf8StreamDecoder()
  private val partial = StringBuilder()
  private var lineNumber = 1

  /** True while skipping the rest of an over-long line, up to its newline. */
  private var discarding = false
  private var ended = false

  fun push(text: String): List<LineEvent> = consume(text)

  fun push(bytes: ByteArray): List<LineEvent> = consume(decoder.decode(bytes, final = false))

  fun end(): List<LineEvent> {
    if (ended) return emptyList()
    val events = consume(decoder.decode(ByteArray(0), final = true)).toMutableList()
    ended = true
    if (!discarding && partial.isNotEmpty()) events += LineEvent.Line(stripCR(partial.toString()), lineNumber)
    partial.setLength(0)
    return events
  }

  private fun consume(text: String): List<LineEvent> {
    val events = mutableListOf<LineEvent>()
    var start = 0
    var newline = text.indexOf('\n', start)
    while (newline != -1) {
      val piece = text.substring(start, newline)
      if (discarding) {
        discarding = false
      } else {
        // The limit excludes the line ending, so measure after removing a \r from \r\n.
        val line = stripCR(partial.toString() + piece)
        events += if (line.length > maxLineLength) LineEvent.Overflow(lineNumber, line.length) else LineEvent.Line(line, lineNumber)
      }
      partial.setLength(0)
      lineNumber++
      start = newline + 1
      newline = text.indexOf('\n', start)
    }
    if (!discarding) {
      partial.append(text, start, text.length)
      // A trailing \r may be the first half of a \r\n ending, so it doesn't count yet.
      val measured = if (partial.endsWith('\r')) partial.length - 1 else partial.length
      if (measured > maxLineLength) {
        events += LineEvent.Overflow(lineNumber, measured)
        partial.setLength(0)
        discarding = true
      }
    }
    return events
  }

  private fun stripCR(line: String) = if (line.endsWith('\r')) line.dropLast(1) else line
}

/**
 * Decodes UTF-8 that arrives in pieces, exactly as the WHATWG Encoding Standard's UTF-8 decoder does
 * (and so as JavaScript's TextDecoder): a character split across chunks waits for the rest, each
 * invalid sequence becomes one U+FFFD, and a byte order mark at the very start is dropped.
 */
internal class Utf8StreamDecoder {
  private var codePoint = 0
  private var bytesSeen = 0
  private var bytesNeeded = 0
  private var lower = 0x80
  private var upper = 0xBF
  private var bomChecked = false
  private val bomBuffer = mutableListOf<Int>()

  fun decode(input: ByteArray, final: Boolean): String {
    val out = StringBuilder()
    var bytes = input.map { it.toInt() and 0xFF }
    if (!bomChecked) {
      // Hold up to three bytes at the start until it's clear whether they are a byte order mark.
      bomBuffer += bytes
      val bom = listOf(0xEF, 0xBB, 0xBF)
      if (!final && bomBuffer.size < 3 && bomBuffer == bom.subList(0, bomBuffer.size)) return ""
      bytes = if (bomBuffer.size >= 3 && bomBuffer.subList(0, 3) == bom) bomBuffer.drop(3) else bomBuffer.toList()
      bomBuffer.clear()
      bomChecked = true
    }
    var i = 0
    while (i < bytes.size) {
      val byte = bytes[i]
      if (bytesNeeded == 0) {
        when (byte) {
          in 0x00..0x7F -> out.append(byte.toChar())
          in 0xC2..0xDF -> { bytesNeeded = 1; codePoint = byte and 0x1F }
          in 0xE0..0xEF -> {
            if (byte == 0xE0) lower = 0xA0
            if (byte == 0xED) upper = 0x9F
            bytesNeeded = 2
            codePoint = byte and 0xF
          }
          in 0xF0..0xF4 -> {
            if (byte == 0xF0) lower = 0x90
            if (byte == 0xF4) upper = 0x8F
            bytesNeeded = 3
            codePoint = byte and 0x7
          }
          else -> out.append('�')
        }
        i++
        continue
      }
      if (byte !in lower..upper) {
        // The sequence ends early: one U+FFFD for it, then this byte is processed again on its own.
        reset()
        out.append('�')
        continue
      }
      lower = 0x80
      upper = 0xBF
      codePoint = (codePoint shl 6) or (byte and 0x3F)
      bytesSeen++
      i++
      if (bytesSeen == bytesNeeded) {
        out.appendCodePoint(codePoint)
        reset()
      }
    }
    if (final && bytesNeeded != 0) {
      reset()
      out.append('�')
    }
    return out.toString()
  }

  private fun reset() {
    codePoint = 0
    bytesSeen = 0
    bytesNeeded = 0
    lower = 0x80
    upper = 0xBF
  }
}
