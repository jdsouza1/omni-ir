// The capabilities table behind the comparison (benchmarks/capabilities.ts, PLAN-COMPARE-PAGE.md A.2):
// every row and cell has everyday words for readers who don't code, and every source exists.
import { existsSync } from "node:fs";
import { CAPABILITIES, CAPABILITY_FORMATS, conformanceCounts, FORMAT_INTROS } from "../benchmarks/capabilities";

describe("capabilities", () => {
  it("answers every question for every format, in plain words too", () => {
    expect(FORMAT_INTROS).toHaveLength(CAPABILITY_FORMATS.length);
    for (const row of CAPABILITIES) {
      expect(row.cells, row.question).toHaveLength(CAPABILITY_FORMATS.length);
      expect(row.plain.endsWith("?"), row.question).toBe(true);
      expect(row.why.length, row.question).toBeGreaterThan(20);
      for (const cell of row.cells) expect(cell.plain.trim(), `${row.question}: ${cell.text}`).not.toBe("");
    }
  });

  it("points every source at a file that exists", () => {
    for (const row of CAPABILITIES)
      for (const cell of row.cells) {
        if (!cell.source?.startsWith("sources/")) continue;
        expect(existsSync(`benchmarks/${cell.source}`), cell.source).toBe(true);
      }
  });

  it("counts Omni-IR's conformance cases from the files", () => {
    const counts = conformanceCounts();
    const cell = CAPABILITIES.find((r) => r.question === "Shared tests for other implementations")!.cells[0]!;
    expect(cell.text).toContain(`${counts.cases} language-neutral conformance cases`);
    expect(counts.cases).toBeGreaterThan(100);
  });
});
