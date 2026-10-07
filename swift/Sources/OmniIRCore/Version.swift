// Versions (SPEC.md [3.9], PLAN-VERSIONING.md): the stream format has its own version,
// omniIRFormatVersion, which changes only when the format does; the marker and version checks use it.
// Port of packages/core/src/version.ts.

/// Releases that carried their package number but didn't change the format: they mean the format they carried.
private let oldReleaseNumbers = ["0.6": "0.5", "0.7": "0.5"]

/// The format a MAJOR.MINOR number stands for: itself, or the format an old release number carried.
public func formatOf(_ version: String) -> String { oldReleaseNumbers[version] ?? version }

/// "MAJOR.MINOR" of a version such as "0.5.0": what a version marker and a request carry.
public func majorMinor(_ version: String = omniIRVersion) -> String {
  version.split(separator: ".", omittingEmptySubsequences: false).prefix(2).joined(separator: ".")
}

/// Compares whole numbers written in decimal, of any length.
private func compareDigits(_ a: Substring, _ b: Substring) -> Int {
  let x = a.drop { $0 == "0" }
  let y = b.drop { $0 == "0" }
  if x.count != y.count { return x.count - y.count }
  return x == y ? 0 : (x < y ? -1 : 1)
}

/// MAJOR and MINOR if `line` has the marker's form: `# omni-ir MAJOR.MINOR`, with spaces or tabs
/// allowed around `#` and at the end, and required after `omni-ir`.
private func markerVersion(_ line: String) -> (Substring, Substring)? {
  let blank: (Character) -> Bool = { $0 == " " || $0 == "\t" }
  let digit: (Character) -> Bool = { $0 >= "0" && $0 <= "9" }
  var rest = line.drop(while: blank)
  guard rest.first == "#" else { return nil }
  rest = rest.dropFirst().drop(while: blank)
  guard rest.hasPrefix("omni-ir") else { return nil }
  rest = rest.dropFirst(7)
  guard let first = rest.first, blank(first) else { return nil }
  rest = rest.drop(while: blank)
  let major = rest.prefix(while: digit)
  rest = rest.dropFirst(major.count)
  guard !major.isEmpty, rest.first == "." else { return nil }
  rest = rest.dropFirst()
  let minor = rest.prefix(while: digit)
  rest = rest.dropFirst(minor.count)
  guard !minor.isEmpty, rest.allSatisfy(blank) else { return nil }
  return (major, minor)
}

/// Compares two MAJOR.MINOR formats, by MAJOR then MINOR, as numbers.
private func compareFormats(_ a: String, _ b: String) -> Int {
  let x = formatOf(a).split(separator: ".", omittingEmptySubsequences: false)
  let y = formatOf(b).split(separator: ".", omittingEmptySubsequences: false)
  let byMajor = compareDigits(x.first ?? "0", y.first ?? "0")
  return byMajor != 0 ? byMajor : compareDigits(x.dropFirst().first ?? "0", y.dropFirst().first ?? "0")
}

/// Whether line 1 is a version marker for a newer format than `format`; old release numbers count as
/// the format they carried.
public func isNewerMarker(_ line: String, format: String = omniIRFormatVersion) -> Bool {
  guard let (major, minor) = markerVersion(line) else { return false }
  return compareFormats("\(major).\(minor)", format) > 0
}
