// Streaming parser: chunks → lines → statements → validated AST in the store.
// (Stub: implemented after the tests.)
import type { ToolRegistry } from "./schema";
import type { OmniDocument, OmniStore } from "./store";
import type { Issue } from "./types";

export type ParserEvent =
  | { type: "node"; id: string; line: number }
  | { type: "pending"; id: string; line: number }
  | { type: "resolved"; id: string; line: number }
  | { type: "warning"; issue: Issue }
  | { type: "error"; issue: Issue }
  | { type: "end"; issues: Issue[] };

export interface ParserOptions {
  tools: ToolRegistry;
  store?: OmniStore;
  maxLineLength?: number;
}

export interface OmniParser {
  readonly store: OmniStore;
  write(chunk: string | Uint8Array): void;
  /** Flush the last line, run the whole-document check and mark missing references. */
  end(): Issue[];
  subscribe(listener: (event: ParserEvent) => void): () => void;
  getSnapshot(): OmniDocument;
}

export function createParser(_options: ParserOptions): OmniParser {
  throw new Error("not implemented");
}

export async function parseStream(
  _source: AsyncIterable<string | Uint8Array>,
  _options: ParserOptions,
): Promise<{ parser: OmniParser; issues: Issue[] }> {
  throw new Error("not implemented");
}
