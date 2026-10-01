// Streaming parser: chunks → lines → statements → validation → document.
// A bad line is reported and skipped; it never stops the stream.
package dev.omniir.core

public class OmniParser(
  public val tools: ToolRegistry,
  /** Names of the pictures in the app's asset registry. Without them, no Image is accepted. */
  public val assets: Set<String> = emptySet(),
) {
  /** Everything accepted so far. */
  public var document: OmniDocument = OmniDocument()
    private set

  /** Every error and warning reported so far, in order. */
  public val issues: List<Issue> get() = reported.toList()
  private val reported = mutableListOf<Issue>()

  /** Write text as it arrives; it may end anywhere, even in the middle of a line. */
  public fun write(text: String) {
    // Not implemented yet (Android plan, task B).
  }

  /** Write UTF-8 bytes as they arrive; a chunk may end in the middle of a character. */
  public fun write(bytes: ByteArray) {
    // Not implemented yet (Android plan, task B).
  }

  /** End of stream: flush the last line, run the whole-document checks and mark missing references. */
  public fun end(): List<Issue> = emptyList()
}
