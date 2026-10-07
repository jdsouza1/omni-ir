// The Omni-IR version this package implements. Kept equal to package.json by a test
// (tests/version.test.ts); conformance/schema.json and the Swift and Kotlin constants follow it.
export const OMNI_IR_VERSION = "0.7.0";

/** "MAJOR.MINOR" of a version such as "0.5.0": what a version marker ([3.9]) and a request ([10.1]) carry. */
export function majorMinor(version: string = OMNI_IR_VERSION): string {
  return version.split(".").slice(0, 2).join(".");
}

/** The version marker line for this version, without a line ending ([3.9], [10.13]). */
export function versionMarker(version: string = OMNI_IR_VERSION): string {
  return `# omni-ir ${majorMinor(version)}`;
}

const MARKER = /^[ \t]*#[ \t]*omni-ir[ \t]+(\d+)\.(\d+)[ \t]*$/;

/** Compares whole numbers written in decimal, of any length. */
function compareDigits(a: string, b: string): number {
  const x = a.replace(/^0+(?=\d)/, "");
  const y = b.replace(/^0+(?=\d)/, "");
  return x.length !== y.length ? x.length - y.length : x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Whether line 1 is a version marker for a newer version than `version` ([3.9]). Any other text,
 * including a marker for the same or an older version, is false.
 */
export function isNewerMarker(line: string, version: string = OMNI_IR_VERSION): boolean {
  const match = MARKER.exec(line);
  if (!match) return false;
  const [major, minor] = version.split(".");
  const byMajor = compareDigits(match[1]!, major ?? "0");
  return byMajor > 0 || (byMajor === 0 && compareDigits(match[2]!, minor ?? "0") > 0);
}
