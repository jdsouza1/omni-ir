// The Swift and Kotlin parsers validate props from catalogs generated from conformance/schema.json;
// they must never fall behind the TypeScript schema.
import { readFileSync } from "node:fs";
import { COMPONENT_TYPES, ISSUE_CODES } from "@omni-ir/core";
import { renderSwiftSchema, SWIFT_SCHEMA_PATH } from "../scripts/swift-schema";

describe("Swift catalog (Schema.generated.swift)", () => {
  const swift = readFileSync(SWIFT_SCHEMA_PATH, "utf8");

  it("is up to date with conformance/schema.json (run npm run swift:schema if this fails)", () => {
    expect(swift).toBe(renderSwiftSchema());
  });

  it("names every component and issue code", () => {
    for (const type of COMPONENT_TYPES) expect(swift).toContain(`= "${type}"`);
    for (const code of Object.keys(ISSUE_CODES)) expect(swift).toContain(`= "${code}"`);
  });
});

describe("iOS demo asset catalog (swift/Demo/Assets.xcassets)", () => {
  it("has the same pictures as app/assets.ts (run npm run swift:assets if this fails)", async () => {
    const { renderAssetCatalog, readCatalogFiles, sameFiles } = await import("../scripts/swift-demo-assets");
    expect(sameFiles(readCatalogFiles(), renderAssetCatalog())).toBe(true);
  });
});

describe("Swift sources", () => {
  // SwiftUI can't catch a view that fails, so the renderer must never trap on stream data (SPEC.md
  // section 8, Failures). Forced unwraps and forced casts are the usual way to trap; none are allowed.
  it("contain no forced unwraps, try! or as!", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((e) => (statSync(join(dir, e)).isDirectory() ? walk(join(dir, e)) : e.endsWith(".swift") ? [join(dir, e)] : []));
    const offending: string[] = [];
    for (const file of walk("swift/Sources")) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const code = line
            .replace(new RegExp("//.*$"), "")
            .replace(new RegExp('#"[^#]*"#', "g"), '""')
            .replace(new RegExp(String.raw`"(?:[^"\\]|\\.)*"`, "g"), '""');
          if (new RegExp(String.raw`try!|as!|[\w)\]]!(?!=)`).test(code)) offending.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offending).toEqual([]);
  });
});

describe("Kotlin catalog (Schema.generated.kt)", () => {
  it("is up to date with conformance/schema.json (run npm run kotlin:schema if this fails)", async () => {
    const { renderKotlinSchema, KOTLIN_SCHEMA_PATH } = await import("../scripts/kotlin-schema");
    expect(readFileSync(KOTLIN_SCHEMA_PATH, "utf8")).toBe(renderKotlinSchema());
  });
});
