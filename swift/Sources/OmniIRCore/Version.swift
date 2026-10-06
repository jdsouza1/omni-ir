// The version marker (SPEC.md [3.9]): line 1 may say which Omni-IR version the stream was written for.
// Port of packages/core/src/version.ts.

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

/// Whether line 1 is a version marker for a newer version than `version`.
public func isNewerMarker(_ line: String, version: String = omniIRVersion) -> Bool {
  guard let (major, minor) = markerVersion(line) else { return false }
  let parts = version.split(separator: ".", omittingEmptySubsequences: false)
  let byMajor = compareDigits(major, parts.first ?? "0")
  return byMajor > 0 || (byMajor == 0 && compareDigits(minor, parts.dropFirst().first ?? "0") > 0)
}
