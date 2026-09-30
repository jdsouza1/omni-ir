// R2: turns arbitrary network chunks into complete lines. (Stub: implemented after the tests.)

export const DEFAULT_MAX_LINE_LENGTH = 16 * 1024;

export type LineEvent =
  | { kind: "line"; text: string; line: number }
  | { kind: "overflow"; line: number; length: number };

export interface LineBufferOptions {
  maxLineLength?: number;
}

export class LineBuffer {
  constructor(_options: LineBufferOptions = {}) {}

  push(_chunk: string | Uint8Array): LineEvent[] {
    throw new Error("not implemented");
  }

  end(): LineEvent[] {
    throw new Error("not implemented");
  }
}
