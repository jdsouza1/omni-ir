// R4: the line start (`id =` or `$key =`) is matched first; everything after it goes through a
// character-by-character tokenizer and a small recursive-descent parser, so commas, parentheses,
// `#` and `$` inside strings are just text. The grammar accepts any well-formed value, including
// nested calls; validation decides what is allowed. Port of packages/core/src/tokenizer.ts. Kotlin
// strings are UTF-16, like JavaScript's, so this follows the TypeScript character for character.
package dev.omniir.core

/** A value as written, before validation. Nothing here is trusted. */
internal sealed interface RawValue {
  data class Str(val value: String) : RawValue
  data class Num(val value: Double) : RawValue
  data class Bool(val value: Boolean) : RawValue
  data object Null : RawValue
  data class Ident(val name: String) : RawValue
  data class StateRef(val key: String) : RawValue
  data class Array(val items: List<RawValue>) : RawValue
  data class Obj(val entries: List<Pair<String, RawValue>>) : RawValue

  /** A component call used as a value. Always rejected by validation (flat syntax). */
  data class Call(val callee: String) : RawValue
}

internal sealed interface RawStatement {
  data class State(val key: String, val value: RawValue) : RawStatement
  data class Call(val id: String, val callee: String, val args: List<RawValue>, val named: List<Pair<String, RawValue>>) : RawStatement
}

internal sealed interface LineResult {
  data object Empty : LineResult
  data class Statement(val statement: RawStatement, val warnings: List<Issue>) : LineResult
  data class Error(val issue: Issue) : LineResult
}

private class LineError(val code: IssueCode, override val message: String, val col: Int) : Exception(message)

internal fun parseLine(text: String): LineResult {
  if (isBlankOrComment(text)) return LineResult.Empty
  val (target, offset) = lineStart(text) ?: return error(IssueCode.SYNTAX, "expected \"name = Component(…)\" or \"\$name = value\"", 1)
  return try {
    val warnings = mutableListOf<Issue>()
    val tokens = tokenize(text.substring(offset), offset, warnings)
    val parser = TokenParser(tokens)
    val statement = if (target.startsWith("$")) parser.stateStatement(target) else parser.callStatement(target)
    LineResult.Statement(statement, warnings)
  } catch (e: LineError) {
    error(e.code, e.message, e.col)
  }
}

private fun error(code: IssueCode, message: String, col: Int): LineResult = LineResult.Error(Issue(code, "col $col: $message"))

// MARK: - Character classes (as JavaScript regular expressions define them)

/** JavaScript's `\s`: WhiteSpace and LineTerminator. */
internal fun isJsWhitespace(c: Char): Boolean = when (c.code) {
  in 0x09..0x0D, 0x20, 0xA0, 0x1680, in 0x2000..0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF -> true
  else -> false
}

/** JavaScript's `.` without the `s` flag: anything but a line terminator. */
private fun isJsDot(c: Char) = !(c == '\n' || c == '\r' || c.code == 0x2028 || c.code == 0x2029)

private fun isIdentStart(c: Char) = c in 'A'..'Z' || c in 'a'..'z' || c == '_'

private fun isIdentChar(c: Char) = isIdentStart(c) || isDigit(c)

private fun isDigit(c: Char) = c in '0'..'9'

/** `^\s*(#.*)?$` */
private fun isBlankOrComment(s: String): Boolean {
  var i = 0
  while (i < s.length && isJsWhitespace(s[i])) i++
  if (i == s.length) return true
  if (s[i] != '#') return false
  return (i + 1 until s.length).all { isJsDot(s[it]) }
}

/** `^\s*(\$?[A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*`: the target and the length of the match. */
private fun lineStart(s: String): Pair<String, Int>? {
  var i = 0
  while (i < s.length && isJsWhitespace(s[i])) i++
  val nameStart = i
  if (i < s.length && s[i] == '$') i++
  if (i >= s.length || !isIdentStart(s[i])) return null
  while (i < s.length && isIdentChar(s[i])) i++
  val name = s.substring(nameStart, i)
  while (i < s.length && isJsWhitespace(s[i])) i++
  if (i >= s.length || s[i] != '=') return null
  i++
  if (i < s.length && s[i] == '=') return null
  while (i < s.length && isJsWhitespace(s[i])) i++
  return name to i
}

// MARK: - Tokenizer

private sealed interface Token {
  val col: Int

  data class Str(val value: String, override val col: Int) : Token
  data class Num(val value: Double, override val col: Int) : Token
  data class Ident(val value: String, override val col: Int) : Token
  data class StateRef(val value: String, override val col: Int) : Token
  data class Punct(val value: Char, override val col: Int) : Token
  data class Eof(override val col: Int) : Token
}

private const val PUNCTUATION = "()[]{},=:"

private fun tokenize(s: String, offset: Int, warnings: MutableList<Issue>): List<Token> {
  val tokens = mutableListOf<Token>()
  var i = 0
  fun col(at: Int) = offset + at + 1

  while (i < s.length) {
    val c = s[i]
    when {
      c == ' ' || c == '\t' -> i++
      c == '#' -> break // comment: the rest of the line is ignored
      c == '"' -> {
        val startCol = col(i)
        val value = StringBuilder()
        i++
        while (true) {
          if (i >= s.length) throw LineError(IssueCode.UNTERMINATED_STRING, "string is never closed", startCol)
          val ch = s[i]
          if (ch == '"') {
            i++
            break
          }
          if (ch == '\\') {
            if (i + 1 >= s.length) throw LineError(IssueCode.UNTERMINATED_STRING, "string is never closed", startCol)
            when (val next = s[i + 1]) {
              '"' -> value.append('"')
              '\\' -> value.append('\\')
              'n' -> value.append('\n')
              else -> {
                // Lenient: keep an unknown escape as literal text rather than dropping the line.
                value.append('\\').append(next)
                warnings += Issue(IssueCode.UNKNOWN_ESCAPE, "col ${col(i)}: unknown escape \"\\$next\" kept as literal text")
              }
            }
            i += 2
            continue
          }
          value.append(ch)
          i++
        }
        tokens += Token.Str(value.toString(), startCol)
      }
      c == '\'' -> throw LineError(IssueCode.SYNTAX, "strings must use double quotes", col(i))
      c == '$' -> {
        var j = i + 1
        if (j >= s.length || !isIdentStart(s[j])) throw LineError(IssueCode.SYNTAX, "expected a state name after \"\$\"", col(i))
        while (j < s.length && isIdentChar(s[j])) j++
        tokens += Token.StateRef(s.substring(i, j), col(i))
        i = j
      }
      isDigit(c) || c == '.' || c == '-' -> {
        val end = numberEnd(s, i) ?: throw LineError(IssueCode.SYNTAX, "unexpected \"$c\"", col(i))
        if (end < s.length && isIdentChar(s[end])) throw LineError(IssueCode.SYNTAX, "invalid number \"${s.substring(i, end + 1)}…\"", col(i))
        // Negative zero ("-0", or underflow such as -1e-400) is the number 0 [4.9].
        val value = s.substring(i, end).toDouble()
        tokens += Token.Num(if (value == 0.0) 0.0 else value, col(i))
        i = end
      }
      isIdentStart(c) -> {
        var j = i
        while (j < s.length && isIdentChar(s[j])) j++
        tokens += Token.Ident(s.substring(i, j), col(i))
        i = j
      }
      c in PUNCTUATION -> {
        tokens += Token.Punct(c, col(i))
        i++
      }
      else -> throw LineError(IssueCode.SYNTAX, "unexpected character \"$c\"", col(i))
    }
  }
  tokens += Token.Eof(col(s.length))
  return tokens
}

/** The end of `-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?` starting at `start`, or null if it doesn't match. */
private fun numberEnd(s: String, start: Int): Int? {
  var i = start
  fun digits(): Int {
    val from = i
    while (i < s.length && isDigit(s[i])) i++
    return i - from
  }
  if (i < s.length && s[i] == '-') i++
  if (digits() > 0) {
    if (i < s.length && s[i] == '.') {
      i++
      digits()
    }
  } else if (i < s.length && s[i] == '.') {
    i++
    if (digits() == 0) return null
  } else {
    return null
  }
  if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
    val mark = i
    i++
    if (i < s.length && (s[i] == '+' || s[i] == '-')) i++
    if (digits() == 0) i = mark
  }
  return i
}

// MARK: - Parser

private class TokenParser(private val tokens: List<Token>) {
  private var i = 0

  /** Lists, objects and calls open inside the current value [4.13]. */
  private var depth = 0

  /** Run `parse` one nesting level deeper, refusing to go past the limit before recursing [4.13]. */
  private inline fun <T> nested(col: Int, parse: () -> T): T {
    if (depth >= Limits.NESTING_DEPTH) throw LineError(IssueCode.SYNTAX, "values may nest at most ${Limits.NESTING_DEPTH} levels deep", col)
    depth++
    try {
      return parse()
    } finally {
      depth--
    }
  }

  fun callStatement(id: String): RawStatement {
    val callee = peek()
    if (callee !is Token.Ident || !isPunct('(', 1)) throw LineError(IssueCode.SYNTAX, "expected a component call such as Text(…)", callee.col)
    i++
    val (args, named) = argumentList()
    expectEnd()
    return RawStatement.Call(id, callee.value, args, named)
  }

  fun stateStatement(key: String): RawStatement {
    if (peek() is Token.Eof) throw LineError(IssueCode.SYNTAX, "expected a value", peek().col)
    val v = value()
    expectEnd()
    return RawStatement.State(key, v)
  }

  /** `( [arg {, arg}] [,] )` where named args (`name = value`) come after positional ones. */
  private fun argumentList(): Pair<List<RawValue>, List<Pair<String, RawValue>>> {
    expectPunct('(')
    val args = mutableListOf<RawValue>()
    val named = mutableListOf<Pair<String, RawValue>>()
    while (!isPunct(')')) {
      val token = peek()
      if (token is Token.Ident && isPunct('=', 1)) {
        i += 2
        named += token.value to value()
      } else {
        if (named.isNotEmpty()) throw LineError(IssueCode.SYNTAX, "positional arguments must come before named ones", token.col)
        args += value()
      }
      if (!isPunct(')')) expectPunct(',')
    }
    expectPunct(')')
    return args to named
  }

  private fun value(): RawValue = when (val token = peek()) {
    is Token.Str -> { i++; RawValue.Str(token.value) }
    is Token.Num -> { i++; RawValue.Num(token.value) }
    is Token.StateRef -> { i++; RawValue.StateRef(token.value) }
    is Token.Ident -> {
      i++
      when {
        token.value == "true" || token.value == "false" -> RawValue.Bool(token.value == "true")
        token.value == "null" -> RawValue.Null
        isPunct('(') -> {
          nested(token.col) { argumentList() } // parsed for well-formedness, then rejected by validation
          RawValue.Call(token.value)
        }
        else -> RawValue.Ident(token.value)
      }
    }
    is Token.Punct -> when (token.value) {
      '[' -> nested(token.col) { array() }
      '{' -> nested(token.col) { obj() }
      else -> throw LineError(IssueCode.SYNTAX, "unexpected \"${token.value}\"", token.col)
    }
    is Token.Eof -> throw LineError(IssueCode.SYNTAX, "line ended where a value was expected", token.col)
  }

  private fun array(): RawValue {
    expectPunct('[')
    val items = mutableListOf<RawValue>()
    while (!isPunct(']')) {
      items += value()
      if (!isPunct(']')) expectPunct(',')
    }
    expectPunct(']')
    return RawValue.Array(items)
  }

  private fun obj(): RawValue {
    expectPunct('{')
    val entries = mutableListOf<Pair<String, RawValue>>()
    while (!isPunct('}')) {
      val key = when (val token = peek()) {
        is Token.Ident -> token.value
        is Token.Str -> token.value
        else -> throw LineError(IssueCode.SYNTAX, "expected an object key", token.col)
      }
      i++
      expectPunct(':')
      entries += key to value()
      if (!isPunct('}')) expectPunct(',')
    }
    expectPunct('}')
    return RawValue.Obj(entries)
  }

  private fun peek(ahead: Int = 0): Token = tokens[minOf(i + ahead, tokens.size - 1)]

  private fun isPunct(p: Char, ahead: Int = 0): Boolean = (peek(ahead) as? Token.Punct)?.value == p

  private fun expectPunct(p: Char) {
    val token = peek()
    if (!isPunct(p)) {
      val found = when (token) {
        is Token.Eof -> "end of line"
        is Token.Str -> "\"${token.value}\""
        is Token.Ident -> "\"${token.value}\""
        is Token.StateRef -> "\"${token.value}\""
        is Token.Num -> "\"${token.value}\""
        is Token.Punct -> "\"${token.value}\""
      }
      throw LineError(IssueCode.SYNTAX, "expected \"$p\" but found $found", token.col)
    }
    i++
  }

  private fun expectEnd() {
    if (peek() !is Token.Eof) throw LineError(IssueCode.SYNTAX, "unexpected text after the statement", peek().col)
  }
}
