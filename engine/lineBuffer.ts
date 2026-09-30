// R2: turns arbitrary network chunks into complete lines.
// Only complete lines leave this class; the unfinished remainder waits for more input.

export const DEFAULT_MAX_LINE_LENGTH = 16 * 1024;

export type LineEvent =
  | { kind: "line"; text: string; line: number }
  | { kind: "overflow"; line: number; length: number };

export interface LineBufferOptions {
  /** Longest line (in UTF-16 code units) kept before the line is dropped. */
  maxLineLength?: number;
}

export class LineBuffer {
  private readonly maxLineLength: number;
  // `stream: true` keeps a multi-byte character that is split across chunks until it completes.
  private readonly decoder = new TextDecoder("utf-8", { fatal: false });
  private partial = "";
  private lineNumber = 1;
  /** True while skipping the rest of an over-long line, up to its newline. */
  private discarding = false;
  private ended = false;

  constructor(options: LineBufferOptions = {}) {
    this.maxLineLength = options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;
  }

  push(chunk: string | Uint8Array): LineEvent[] {
    if (this.ended) throw new Error("LineBuffer: push() after end()");
    const text = typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
    return this.consume(text);
  }

  end(): LineEvent[] {
    if (this.ended) return [];
    const events = this.consume(this.decoder.decode());
    this.ended = true;
    if (!this.discarding && this.partial.length > 0) {
      events.push({ kind: "line", text: stripCR(this.partial), line: this.lineNumber });
    }
    this.partial = "";
    return events;
  }

  private consume(text: string): LineEvent[] {
    const events: LineEvent[] = [];
    let start = 0;
    let newline = text.indexOf("\n", start);

    while (newline !== -1) {
      const piece = text.slice(start, newline);
      if (this.discarding) {
        this.discarding = false;
      } else {
        const line = this.partial + piece;
        if (line.length > this.maxLineLength) {
          events.push({ kind: "overflow", line: this.lineNumber, length: line.length });
        } else {
          events.push({ kind: "line", text: stripCR(line), line: this.lineNumber });
        }
      }
      this.partial = "";
      this.lineNumber++;
      start = newline + 1;
      newline = text.indexOf("\n", start);
    }

    if (!this.discarding) {
      this.partial += text.slice(start);
      if (this.partial.length > this.maxLineLength) {
        events.push({ kind: "overflow", line: this.lineNumber, length: this.partial.length });
        this.partial = "";
        this.discarding = true;
      }
    }
    return events;
  }
}

function stripCR(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
