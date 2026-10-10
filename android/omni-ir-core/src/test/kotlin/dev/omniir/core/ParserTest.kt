// Parser behaviour outside the conformance suite's scope: events, local state edits, and stream edges.
package dev.omniir.core

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private val tools: ToolRegistry = mapOf("payments.confirm" to Tool.acceptsAnything)

class ParserTest {
  @Test
  fun `a marker for a newer version flags the document, so the renderer can ask for an update`() {
    val newer = OmniParser(tools)
    newer.write("# omni-ir 99.0\nroot = Divider()\n")
    newer.end()
    assertTrue(newer.document.newerVersion && newer.document.complete)
    assertEquals(setOf("root"), newer.document.nodes.keys)
    val same = OmniParser(tools)
    same.write("# omni-ir $FORMAT_VERSION\nroot = Divider()\n")
    assertEquals(false, same.document.newerVersion)
    // Format 0.8 added field constraints; releases 0.6 and 0.7 mean format 0.5. The next format is 0.9.
    assertEquals(false, isNewerMarker("# omni-ir 0.8"))
    assertEquals(false, isNewerMarker("# omni-ir 0.7"))
    assertEquals(true, isNewerMarker("# omni-ir 0.9"))
    assertEquals(false, isNewerMarker("# omni-ir 0.7", format = "0.5"))
    assertEquals("0.8", FORMAT_VERSION)
  }

  @Test
  fun `reports pending references and resolves them as their lines arrive`() {
    val parser = OmniParser(tools)
    val events = mutableListOf<ParserEvent>()
    parser.onEvent = { events += it }
    parser.write("root = Card([title])\n")
    assertEquals(setOf("title"), parser.document.pending)
    parser.write("title = Heading(\"Hi\")\n")
    parser.end()
    assertEquals(
      listOf(
        ParserEvent.Node("root", 1), ParserEvent.Pending("title", 1),
        ParserEvent.Node("title", 2), ParserEvent.Resolved("title", 2),
        ParserEvent.End(emptyList()),
      ),
      events,
    )
    assertTrue(parser.document.complete && parser.document.missing.isEmpty())
  }

  @Test
  fun `an Input's state can be edited locally, but undeclared keys cannot be created`() {
    val parser = OmniParser(tools)
    var changes = 0
    parser.onChange = { changes++ }
    parser.write("root = Input(\$note, label=\"Note\")\n\$note = \"\"\n")
    val before = changes
    parser.setState("\$note", Primitive.Text("hello"))
    assertEquals(Primitive.Text("hello"), parser.document.state["\$note"])
    parser.setState("\$note", Primitive.Text("hello")) // unchanged: no notification
    parser.setState("\$other", Primitive.Text("x")) // never declared: ignored
    assertEquals(null, parser.document.state["\$other"])
    assertEquals(before + 1, changes)
  }

  @Test
  fun `writing after end is ignored, and end returns the same issues again`() {
    val parser = OmniParser(tools)
    val issues = parser.end()
    assertEquals(listOf(IssueCode.MISSING_ROOT), issues.map { it.code })
    parser.write("root = Divider()\n")
    assertTrue(parser.document.nodes.isEmpty())
    assertEquals(issues, parser.end())
  }

  @Test
  fun `a byte order mark at the start of a byte stream is dropped, even when split`() {
    val parser = OmniParser(tools)
    for (byte in listOf(0xEF, 0xBB, 0xBF)) parser.write(byteArrayOf(byte.toByte()))
    parser.write("root = Divider()\n".toByteArray())
    assertTrue(parser.end().isEmpty())
    assertEquals(ComponentType.DIVIDER, parser.document.nodes["root"]?.type)
  }

  @Test
  fun `invalid UTF-8 becomes U+FFFD, and a character split across chunks is kept whole`() {
    val parser = OmniParser(tools)
    val bytes = "root = Text(\"é".toByteArray() + byteArrayOf(0xFF.toByte()) + "\")\n".toByteArray()
    parser.write(bytes.copyOfRange(0, 14)) // ends after the first byte of "é"
    parser.write(bytes.copyOfRange(14, bytes.size))
    parser.end()
    assertEquals(PropValue.Text("é�"), parser.document.nodes["root"]?.props?.get("text"))
  }

  @Test
  fun `invalid sequences are replaced the way the web's TextDecoder does`() {
    fun decode(vararg b: Int) = Utf8StreamDecoder().decode(ByteArray(b.size) { b[it].toByte() }, final = true)
    assertEquals("�A", decode(0xE2, 0x82, 0x41)) // a truncated 3-byte sequence is one U+FFFD
    assertEquals("��", decode(0xC0, 0x80)) // overlong encodings are never valid
    assertEquals("���", decode(0xED, 0xA0, 0x80)) // UTF-16 surrogates are not characters
    assertEquals("😀", decode(0xF0, 0x9F, 0x98, 0x80))
    assertEquals("�", decode(0xF0, 0x9F)) // cut off at the end of the stream
  }
}
