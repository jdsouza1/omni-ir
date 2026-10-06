// The version marker (SPEC.md [3.9]): line 1 may say which Omni-IR version the stream was written for.
// Port of packages/core/src/version.ts.
package dev.omniir.core

private val MARKER = Regex("""^[ \t]*#[ \t]*omni-ir[ \t]+([0-9]+)\.([0-9]+)[ \t]*$""")

/** Compares whole numbers written in decimal, of any length. */
private fun compareDigits(a: String, b: String): Int {
  val x = a.trimStart('0').ifEmpty { "0" }
  val y = b.trimStart('0').ifEmpty { "0" }
  return if (x.length != y.length) x.length - y.length else x.compareTo(y)
}

/** Whether line 1 is a version marker for a newer version than [version]. */
public fun isNewerMarker(line: String, version: String = OMNI_IR_VERSION): Boolean {
  val match = MARKER.matchEntire(line) ?: return false
  val parts = version.split(".")
  val byMajor = compareDigits(match.groupValues[1], parts.getOrElse(0) { "0" })
  return byMajor > 0 || (byMajor == 0 && compareDigits(match.groupValues[2], parts.getOrElse(1) { "0" }) > 0)
}

/** "MAJOR.MINOR" of this version: what a version marker and a request carry. */
public fun majorMinor(version: String = OMNI_IR_VERSION): String = version.split(".").take(2).joinToString(".")
