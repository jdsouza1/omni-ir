// The Swift parser validates props from swift/Sources/OmniIRCore/Schema.generated.swift, generated
// from conformance/schema.json; it must never fall behind the TypeScript schema.
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
