// R4: line-start regex + character-by-character tokenizer + small parser for the tokens.
// (Stub: implemented after the tests.)
import type { Issue, RawStatement } from "./types";

export type LineResult =
  | { kind: "empty" }
  | { kind: "statement"; statement: RawStatement; warnings: Issue[] }
  | { kind: "error"; issues: Issue[] };

export function parseLine(_text: string): LineResult {
  throw new Error("not implemented");
}
