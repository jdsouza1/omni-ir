// Two versions (PLAN-VERSIONING.md):
// - OMNI_IR_VERSION is this package's release, kept equal to package.json by a test.
// - FORMAT_VERSION is the stream format's, which changes only when the grammar, the catalog or the
//   document rules do. It is what the version marker ([3.9]), requests ([10.1]) and the server's check
//   ([10.12]) carry. A test fingerprints the format and fails if it changes without a new number.
export const OMNI_IR_VERSION = "0.10.0";

/** The stream format, MAJOR.MINOR. The next one is 0.8, above every number a shipped app has used. */
export const FORMAT_VERSION = "0.5";

/**
 * Releases that carried their package number in the marker and requests but didn't change the format:
 * those numbers mean the format they carried ([3.9]). Kept forever.
 */
const OLD_RELEASE_NUMBERS: Readonly<Record<string, string>> = { "0.6": "0.5", "0.7": "0.5" };

/** "MAJOR.MINOR" of a version such as "0.5.0". */
export function majorMinor(version: string = OMNI_IR_VERSION): string {
  return version.split(".").slice(0, 2).join(".");
}

/** The format a MAJOR.MINOR number stands for: itself, or the format an old release number carried. */
export function formatOf(version: string): string {
  return Object.hasOwn(OLD_RELEASE_NUMBERS, version) ? OLD_RELEASE_NUMBERS[version]! : version;
}

/** The version marker line for a format, without a line ending ([3.9], [10.13]). */
export function versionMarker(format: string = FORMAT_VERSION): string {
  return `# omni-ir ${majorMinor(format)}`;
}

const MARKER = /^[ \t]*#[ \t]*omni-ir[ \t]+(\d+)\.(\d+)[ \t]*$/;

/** Compares whole numbers written in decimal, of any length. */
function compareDigits(a: string, b: string): number {
  const x = a.replace(/^0+(?=\d)/, "");
  const y = b.replace(/^0+(?=\d)/, "");
  return x.length !== y.length ? x.length - y.length : x < y ? -1 : x > y ? 1 : 0;
}

/** Compares two MAJOR.MINOR formats, by MAJOR then MINOR, as numbers. */
function compareFormats(a: string, b: string): number {
  const [aMajor = "0", aMinor = "0"] = formatOf(a).split(".");
  const [bMajor = "0", bMinor = "0"] = formatOf(b).split(".");
  return compareDigits(aMajor, bMajor) || compareDigits(aMinor, bMinor);
}

/**
 * Whether line 1 is a version marker for a newer format than `format` ([3.9]). Old release numbers
 * count as the format they carried. Any other text, or the same or an older format, is false.
 */
export function isNewerMarker(line: string, format: string = FORMAT_VERSION): boolean {
  const match = MARKER.exec(line);
  return match !== null && compareFormats(`${match[1]}.${match[2]}`, format) > 0;
}

/**
 * Whether a client that asked for `requested` (MAJOR.MINOR) can read a stream in `written`: within
 * 0.x formats only add, so a client reads its own format and every older one ([10.12]).
 */
export function canRead(requested: string, written: string = FORMAT_VERSION): boolean {
  return compareFormats(written, requested) <= 0;
}
