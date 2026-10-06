// Fuzz tests for the TypeScript parser (PLAN-HARDENING.md, B.1): thousands of random and broken
// streams. Whatever arrives, the parser must never throw, every issue must be well-formed, and how
// the bytes are split must never change the result ([3.3]).
//
// CI runs a fixed seed. Override with FUZZ_RUNS (runs per property) and FUZZ_SEED; a failure prints
// the seed and the smallest failing stream, which belongs in a conformance case once understood.
import fc from "fast-check";
import { ISSUE_CODES } from "@omni-ir/core";
import { fixtureTexts, FUZZ_ASSETS, FUZZ_TOOLS, mutatedFixture, splitBytes, splitPoints, stream } from "../fuzz/arbitraries";
import { parseCanonical, type Canonical } from "./canonical";

const numRuns = Number(process.env.FUZZ_RUNS ?? 1000);
const seed = Number(process.env.FUZZ_SEED ?? 20261005);
const options = { numRuns, seed, endOnFailure: false };
const registry = { tools: FUZZ_TOOLS, assets: FUZZ_ASSETS };
const encoder = new TextEncoder();
const fixtures = fixtureTexts();

/** Every issue has a known code, and a line number that exists in the stream (or none). */
function wellFormed(result: Canonical, text: string) {
  const lines = text.split(/\r\n|\r|\n/).length + 1;
  for (const issue of result.issues) {
    expect(Object.hasOwn(ISSUE_CODES, issue.code), issue.code).toBe(true);
    if (issue.line !== null) {
      expect(Number.isInteger(issue.line) && issue.line >= 1 && issue.line <= lines, `line ${issue.line} of ${lines}`).toBe(true);
    }
  }
}

describe("fuzz: the parser never breaks", () => {
  it("random streams of almost-right lines: no exception, well-formed issues", () => {
    fc.assert(
      fc.property(stream, (text) => {
        wellFormed(parseCanonical([text], registry), text);
      }),
      options,
    );
  }, 120_000);

  it("arbitrary text, including lone surrogates and control characters", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 3000 }), (text) => {
        wellFormed(parseCanonical([text], registry), text);
      }),
      options,
    );
  }, 120_000);

  it("arbitrary bytes, including invalid UTF-8, split anywhere", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 3000 }), splitPoints, (bytes, points) => {
        const whole = parseCanonical([bytes], registry);
        expect(parseCanonical(splitBytes(bytes, points), registry)).toEqual(whole);
      }),
      options,
    );
  }, 120_000);

  it("real fixtures with random edits: no exception, well-formed issues", () => {
    fc.assert(
      fc.property(mutatedFixture(fixtures), (text) => {
        wellFormed(parseCanonical([text], registry), text);
      }),
      options,
    );
  }, 120_000);
});

describe("fuzz: lines at the edges [4.13]", () => {
  // Found by fuzzing the Kotlin parser (B.3): deep nesting overflowed its stack. Every parser now
  // stops at 8 levels; this checks the TypeScript one survives far deeper input.
  const deep = fc.oneof(
    fc.integer({ min: 1, max: 9000 }).map((n) => `root = Card(${"[".repeat(n)}${"]".repeat(n)})`),
    fc.integer({ min: 1, max: 4000 }).map((n) => `$a = ${"{x: ".repeat(n)}1${"}".repeat(n)}`),
    fc.integer({ min: 1, max: 9000 }).map((n) => `t = Text(${"a(".repeat(n)}1${")".repeat(n)})`),
    fc.integer({ min: 1, max: 9000 }).map((n) => "(".repeat(n)),
  );
  it("deep nesting never throws, and deeper than 8 levels is a syntax error", () => {
    fc.assert(
      fc.property(deep, (text) => {
        const result = parseCanonical([`${text}\n`], registry);
        wellFormed(result, text);
      }),
      { ...options, numRuns: Math.min(numRuns, 200) },
    );
    const nine = parseCanonical([`$a = ${"[".repeat(9)}1${"]".repeat(9)}\n`], registry);
    expect(nine.issues).toContainEqual({ line: 1, code: "syntax" });
  }, 120_000);
});

describe("fuzz: how the stream is split never matters [3.3]", () => {
  it("broken streams give the same result whole and split at random bytes", () => {
    fc.assert(
      fc.property(fc.oneof(stream, mutatedFixture(fixtures)), splitPoints, (text, points) => {
        const bytes = encoder.encode(text);
        expect(parseCanonical(splitBytes(bytes, points), registry)).toEqual(parseCanonical([text], registry));
      }),
      options,
    );
  }, 120_000);

  it("every fixture, split at random bytes, still parses exactly as when whole", () => {
    fc.assert(
      fc.property(fc.constantFrom(...fixtures), splitPoints, (text, points) => {
        const bytes = encoder.encode(text);
        expect(parseCanonical(splitBytes(bytes, points), registry)).toEqual(parseCanonical([text], registry));
      }),
      { ...options, numRuns: Math.min(numRuns, 300) },
    );
  });
});

describe("the differential corpus (fuzz/corpus.json)", () => {
  it("is current: the TypeScript parser's results haven't changed (run npm run fuzz:corpus if this fails)", async () => {
    const { buildCorpus, CORPUS_FILE } = await import("../fuzz/build");
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(CORPUS_FILE, "utf8") === buildCorpus(), "fuzz/corpus.json is out of date").toBe(true);
  }, 120_000);
});
