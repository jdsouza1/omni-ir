import { readFileSync } from "node:fs";
import { majorMinor, OMNI_IR_VERSION, versionMarker } from "@omni-ir/core";

describe("OMNI_IR_VERSION", () => {
  it("equals the packages' and the exported schema's version", () => {
    for (const file of ["package.json", "packages/core/package.json", "packages/react/package.json", "conformance/schema.json"]) {
      expect((JSON.parse(readFileSync(file, "utf8")) as { version: string }).version, file).toBe(OMNI_IR_VERSION);
    }
  });

  it("gives the marker line and MAJOR.MINOR [3.9] [10.13]", () => {
    expect(majorMinor("0.5.0")).toBe("0.5");
    expect(versionMarker("0.5.0")).toBe("# omni-ir 0.5");
    expect(versionMarker()).toBe(`# omni-ir ${majorMinor(OMNI_IR_VERSION)}`);
  });
});
