// The Omni-IR version this package implements. Kept equal to package.json by a test
// (tests/version.test.ts); conformance/schema.json and the Swift and Kotlin constants follow it.
export const OMNI_IR_VERSION = "0.4.0";

/** "MAJOR.MINOR" of a version such as "0.5.0": what a version marker ([3.9]) and a request ([10.1]) carry. */
export function majorMinor(version: string = OMNI_IR_VERSION): string {
  return version.split(".").slice(0, 2).join(".");
}

/** The version marker line for this version, without a line ending ([3.9], [10.13]). */
export function versionMarker(version: string = OMNI_IR_VERSION): string {
  return `# omni-ir ${majorMinor(version)}`;
}
