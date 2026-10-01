// A small JSON reader and writer for the client's payloads, so the runtime needs no JSON library.
// Objects are Map<String, Any?>, arrays List<Any?>, numbers Double, plus String, Boolean and null.
package dev.omniir.runtime

import dev.omniir.core.Primitive

internal object Json {
  /** The value as JSON text. */
  fun write(value: Any?): String = StringBuilder().also { write(value, it) }.toString()

  fun obj(entries: Map<String, Any?>): String = write(entries)

  fun primitive(value: Primitive): Any? = when (value) {
    is Primitive.Text -> value.value
    is Primitive.Number -> value.value
    is Primitive.Bool -> value.value
    Primitive.Null -> null
  }

  /** The text parsed as a JSON object, or null if it isn't one. */
  fun parseObject(text: String): Map<*, *>? = try {
    Reader(text).run { val v = value(); skipSpace(); if (at < text.length) null else v as? Map<*, *> }
  } catch (e: IllegalArgumentException) {
    null
  }

  private fun write(value: Any?, out: StringBuilder) {
    when (value) {
      null -> out.append("null")
      is String -> writeString(value, out)
      is Boolean -> out.append(value)
      is Double -> out.append(if (value.isFinite()) jsNumberText(value) else "null")
      is Number -> out.append(value)
      is Map<*, *> -> {
        out.append('{')
        value.entries.forEachIndexed { i, (k, v) ->
          if (i > 0) out.append(',')
          writeString(k.toString(), out)
          out.append(':')
          write(v, out)
        }
        out.append('}')
      }
      is List<*> -> {
        out.append('[')
        value.forEachIndexed { i, v ->
          if (i > 0) out.append(',')
          write(v, out)
        }
        out.append(']')
      }
      else -> writeString(value.toString(), out)
    }
  }

  private fun writeString(s: String, out: StringBuilder) {
    out.append('"')
    for (c in s) {
      when {
        c == '"' -> out.append("\\\"")
        c == '\\' -> out.append("\\\\")
        c == '\n' -> out.append("\\n")
        c == '\r' -> out.append("\\r")
        c == '\t' -> out.append("\\t")
        c < ' ' -> out.append(String.format("\\u%04x", c.code))
        else -> out.append(c)
      }
    }
    out.append('"')
  }

  private class Reader(private val text: String) {
    var at = 0

    fun skipSpace() {
      while (at < text.length && text[at] in " \t\r\n") at++
    }

    fun value(): Any? {
      skipSpace()
      require(at < text.length) { "unexpected end" }
      return when (text[at]) {
        '{' -> obj()
        '[' -> array()
        '"' -> string()
        't' -> literal("true", true)
        'f' -> literal("false", false)
        'n' -> literal("null", null)
        else -> number()
      }
    }

    private fun obj(): Map<String, Any?> {
      val out = linkedMapOf<String, Any?>()
      at++
      skipSpace()
      if (text.getOrNull(at) == '}') { at++; return out }
      while (true) {
        skipSpace()
        val key = string()
        skipSpace()
        require(text.getOrNull(at) == ':') { "expected :" }
        at++
        out[key] = value()
        skipSpace()
        when (text.getOrNull(at)) {
          ',' -> at++
          '}' -> { at++; return out }
          else -> throw IllegalArgumentException("expected , or }")
        }
      }
    }

    private fun array(): List<Any?> {
      val out = mutableListOf<Any?>()
      at++
      skipSpace()
      if (text.getOrNull(at) == ']') { at++; return out }
      while (true) {
        out += value()
        skipSpace()
        when (text.getOrNull(at)) {
          ',' -> at++
          ']' -> { at++; return out }
          else -> throw IllegalArgumentException("expected , or ]")
        }
      }
    }

    private fun string(): String {
      require(text.getOrNull(at) == '"') { "expected a string" }
      at++
      val out = StringBuilder()
      while (true) {
        require(at < text.length) { "unterminated string" }
        val c = text[at++]
        when (c) {
          '"' -> return out.toString()
          '\\' -> {
            require(at < text.length) { "unterminated escape" }
            when (val e = text[at++]) {
              'n' -> out.append('\n')
              'r' -> out.append('\r')
              't' -> out.append('\t')
              'b' -> out.append('\b')
              'f' -> out.append('\u000C')
              'u' -> {
                require(at + 4 <= text.length) { "bad \\u escape" }
                out.append(text.substring(at, at + 4).toInt(16).toChar())
                at += 4
              }
              else -> out.append(e)
            }
          }
          else -> out.append(c)
        }
      }
    }

    private fun literal(word: String, value: Any?): Any? {
      require(text.startsWith(word, at)) { "expected $word" }
      at += word.length
      return value
    }

    private fun number(): Double {
      val start = at
      while (at < text.length && (text[at].isDigit() || text[at] in "+-.eE")) at++
      return text.substring(start, at).toDoubleOrNull() ?: throw IllegalArgumentException("bad number")
    }
  }
}
