// Versions (SPEC.md [3.9], PLAN-VERSIONING.md): the stream format has its own version, FORMAT_VERSION,
// which changes only when the format does; the marker and version checks use it. Port of
// packages/core/src/version.ts.
package dev.omniir.core

private val MARKER = Regex("""^[ \t]*#[ \t]*omni-ir[ \t]+([0-9]+)\.([0-9]+)[ \t]*$""")

/** Releases that carried their package number but didn't change the format: they mean the format they carried. */
private val OLD_RELEASE_NUMBERS = mapOf("0.6" to "0.5", "0.7" to "0.5")

/** The format a MAJOR.MINOR number stands for: itself, or the format an old release number carried. */
public fun formatOf(version: String): String = OLD_RELEASE_NUMBERS[version] ?: version

/** Compares whole numbers written in decimal, of any length. */
private fun compareDigits(a: String, b: String): Int {
  val x = a.trimStart('0').ifEmpty { "0" }
  val y = b.trimStart('0').ifEmpty { "0" }
  return if (x.length != y.length) x.length - y.length else x.compareTo(y)
}

/** Compares two MAJOR.MINOR formats, by MAJOR then MINOR, as numbers. */
private fun compareFormats(a: String, b: String): Int {
  val x = formatOf(a).split(".")
  val y = formatOf(b).split(".")
  val byMajor = compareDigits(x.getOrElse(0) { "0" }, y.getOrElse(0) { "0" })
  return if (byMajor != 0) byMajor else compareDigits(x.getOrElse(1) { "0" }, y.getOrElse(1) { "0" })
}

/** Whether line 1 is a version marker for a newer format than [format]; old release numbers count as the format they carried. */
public fun isNewerMarker(line: String, format: String = FORMAT_VERSION): Boolean {
  val match = MARKER.matchEntire(line) ?: return false
  return compareFormats("${match.groupValues[1]}.${match.groupValues[2]}", format) > 0
}

/** "MAJOR.MINOR" of a version such as "0.8.0". */
public fun majorMinor(version: String = OMNI_IR_VERSION): String = version.split(".").take(2).joinToString(".")
