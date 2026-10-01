// Size and streaming measurements. Tokens are counted offline with tiktoken's GPT-5 encoding,
// the same counter OpenUI's benchmark uses, so the numbers line up with its published table.
import { encoding_for_model, type Tiktoken } from "tiktoken";
import type { Emitted } from "./emit";
import { nodes, parents, ROOT, type Screen } from "./tree";

let encoder: Tiktoken | undefined;
export function tokens(text: string): number {
  encoder ??= encoding_for_model("gpt-5");
  return encoder.encode(text).length;
}
export function freeEncoder() {
  encoder?.free();
  encoder = undefined;
}

export interface Streaming {
  /** Share of the reply's tokens that must arrive before the first piece of content can be drawn. */
  first: number;
  /** … before half of the content can be drawn. */
  half: number;
  /** The same two points in tokens. */
  firstTokens: number;
  halfTokens: number;
}

/**
 * A component can be drawn once it and every component above it up to the root have arrived
 * (each format's renderer draws a complete component and leaves gaps for children still to come).
 * Layout containers (Stack, Card, …) are not counted as content.
 */
export function streaming(screen: Screen, out: Emitted): Streaming {
  const up = parents(screen);
  const total = tokens(out.text);
  const drawableAt = (id: string): number => {
    let at = 0;
    let cur = id;
    for (;;) {
      const arrived = out.arrivals.get(cur);
      if (arrived === undefined) return out.text.length;
      at = Math.max(at, arrived);
      if (cur === ROOT) return at;
      const parent = up.get(cur);
      if (parent === undefined) return out.text.length; // not reachable from the root
      cur = parent;
    }
  };
  const content = nodes(screen).filter((n) => !screen.catalog.isLayout(n.type));
  const offsets = content.map((n) => drawableAt(n.id)).sort((a, b) => a - b);
  const firstTokens = tokens(out.text.slice(0, offsets[0] ?? out.text.length));
  const halfTokens = tokens(out.text.slice(0, offsets[Math.ceil(offsets.length / 2) - 1] ?? out.text.length));
  return { first: round(firstTokens / total, 3), half: round(halfTokens / total, 3), firstTokens, halfTokens };
}

export const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
