// Versions (PLAN-VERSIONING.md): the packages carry their release number; the stream format carries its
// own, which changes only when the format does. Old release numbers that never changed the format are
// understood as the format they carried, and a server serves any client that can read its format.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { FORMAT_VERSION, OMNI_IR_VERSION, canRead, formatOf, majorMinor, versionMarker } from "@omni-ir/core";

/**
 * The format's fingerprint: the parts of conformance/schema.json that decide which streams are valid
 * (components, props, limits, reserved words, issue codes and their severity), without wording.
 */
function fingerprint(): string {
  const schema = JSON.parse(readFileSync("conformance/schema.json", "utf8")) as Record<string, unknown>;
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v)
          .filter((k) => !["$comment", "description", "meaning", "version", "formatVersion", "stage"].includes(k))
          .sort()
          .map((k) => [k, strip((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return createHash("sha256").update(JSON.stringify(strip(schema))).digest("hex");
}

/**
 * The fingerprint of format 0.5. When this test fails, the format changed: bump FORMAT_VERSION (the next
 * one is 0.8, above every number a shipped app has used), add the old number to the table only if it was
 * a release without a format change, and update this value.
 */
const FORMAT_FINGERPRINT = "bfb80cbd7a8edf361fd9d9dd75f5f6d44daa011a67dc6656a641e9b900170e86";

describe("package and format versions", () => {
  it("keeps the package version equal to the packages' and the exported schema's", () => {
    for (const file of ["package.json", "packages/core/package.json", "packages/react/package.json", "conformance/schema.json"]) {
      expect((JSON.parse(readFileSync(file, "utf8")) as { version: string }).version, file).toBe(OMNI_IR_VERSION);
    }
  });

  it("gives the stream format its own version, 0.5, exported for other renderers", () => {
    expect(FORMAT_VERSION).toBe("0.5");
    expect((JSON.parse(readFileSync("conformance/schema.json", "utf8")) as { formatVersion: string }).formatVersion).toBe(FORMAT_VERSION);
  });

  it("writes the format version in the marker [3.9] [10.13]", () => {
    expect(versionMarker()).toBe("# omni-ir 0.5");
    expect(majorMinor("0.8.0")).toBe("0.8");
  });

  it("understands the release numbers 0.6 and 0.7 as format 0.5, and nothing else as an alias", () => {
    expect(formatOf("0.6")).toBe("0.5");
    expect(formatOf("0.7")).toBe("0.5");
    for (const v of ["0.5", "0.8", "0.4", "1.0", "99.0"]) expect(formatOf(v), v).toBe(v);
  });

  it("serves any client that can read the format it writes [10.12]", () => {
    for (const asked of ["0.5", "0.6", "0.7", "0.8", "1.0", "99.0", "0.10"]) expect(canRead(asked), asked).toBe(true);
    for (const asked of ["0.4", "0.1", "0.0"]) expect(canRead(asked), asked).toBe(false);
  });

  it("fails when the format changes without a new format version (see FORMAT_FINGERPRINT)", () => {
    expect(fingerprint(), `the format changed: bump FORMAT_VERSION (next: 0.8) and update FORMAT_FINGERPRINT`).toBe(FORMAT_FINGERPRINT);
  });
});
