// R4: a regex matches only the line start (`id =` or `$key =`). Everything after it goes through a
// character-by-character tokenizer and a small recursive-descent parser, so commas, parentheses,
// `#` and `$` inside strings are just text. The grammar accepts any well-formed value, including
// nested calls; `schema.ts` decides what is allowed.
import { LIMITS } from "./schema.js";
import type { Issue, IssueCode, RawStatement, RawValue } from "./types.js";

export type LineResult =
  | { kind: "empty" }
  | { kind: "statement"; statement: RawStatement; warnings: Issue[] }
  | { kind: "error"; issues: Issue[] };

const LINE_START = /^\s*(\$?[A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)\s*/;
const BLANK_OR_COMMENT = /^\s*(#.*)?$/;
const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER = /-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
const IDENT_CHAR = /[A-Za-z0-9_]/;

type Token =
  | { type: "string"; value: string; col: number }
  | { type: "number"; value: number; col: number }
  | { type: "ident"; value: string; col: number }
  | { type: "state"; value: string; col: number }
  | { type: "punct"; value: "(" | ")" | "[" | "]" | "{" | "}" | "," | "=" | ":"; col: number }
  | { type: "eof"; col: number };

class LineError extends Error {
  constructor(
    readonly code: IssueCode,
    message: string,
    readonly col: number,
  ) {
    super(message);
  }
}

export function parseLine(text: string): LineResult {
  if (BLANK_OR_COMMENT.test(text)) return { kind: "empty" };

  const start = LINE_START.exec(text);
  if (!start) {
    return error("syntax", 'expected "name = Component(…)" or "$name = value"', 1);
  }
  const target = start[1]!;
  const offset = start[0].length;

  try {
    const warnings: Issue[] = [];
    const tokens = tokenize(text.slice(offset), offset, warnings);
    const parser = new TokenParser(tokens);
    const statement = target.startsWith("$")
      ? parser.stateStatement(target)
      : parser.callStatement(target);
    return { kind: "statement", statement, warnings };
  } catch (err) {
    if (err instanceof LineError) return error(err.code, err.message, err.col);
    throw err;
  }
}

function error(code: IssueCode, message: string, col: number): LineResult {
  return { kind: "error", issues: [{ code, message: `col ${col}: ${message}` }] };
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const PUNCT = new Set(["(", ")", "[", "]", "{", "}", ",", "=", ":"]);

function tokenize(source: string, offset: number, warnings: Issue[]): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const col = (at: number) => offset + at + 1;

  while (i < source.length) {
    const c = source[i]!;

    if (c === " " || c === "\t") {
      i++;
    } else if (c === "#") {
      break; // comment: the rest of the line is ignored
    } else if (c === '"') {
      const startCol = col(i);
      let value = "";
      i++;
      for (;;) {
        if (i >= source.length) throw new LineError("unterminated_string", "string is never closed", startCol);
        const ch = source[i]!;
        if (ch === '"') {
          i++;
          break;
        }
        if (ch === "\\") {
          const next = source[i + 1];
          if (next === undefined) throw new LineError("unterminated_string", "string is never closed", startCol);
          if (next === '"') value += '"';
          else if (next === "\\") value += "\\";
          else if (next === "n") value += "\n";
          else {
            // Lenient: keep an unknown escape as literal text rather than dropping the line.
            value += "\\" + next;
            warnings.push({
              code: "unknown_escape",
              message: `col ${col(i)}: unknown escape "\\${next}" kept as literal text`,
            });
          }
          i += 2;
          continue;
        }
        value += ch;
        i++;
      }
      tokens.push({ type: "string", value, col: startCol });
    } else if (c === "'") {
      throw new LineError("syntax", "strings must use double quotes", col(i));
    } else if (c === "$") {
      IDENT.lastIndex = i + 1;
      const m = IDENT.exec(source);
      if (!m) throw new LineError("syntax", 'expected a state name after "$"', col(i));
      tokens.push({ type: "state", value: "$" + m[0], col: col(i) });
      i = IDENT.lastIndex;
    } else if (/[0-9.-]/.test(c)) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(source);
      if (!m) throw new LineError("syntax", `unexpected "${c}"`, col(i));
      const end = NUMBER.lastIndex;
      if (end < source.length && IDENT_CHAR.test(source[end]!)) {
        throw new LineError("syntax", `invalid number "${source.slice(i, end + 1)}…"`, col(i));
      }
      // Negative zero ("-0", or underflow such as -1e-400) is the number 0 [4.9].
      const value = Number(m[0]);
      tokens.push({ type: "number", value: value === 0 ? 0 : value, col: col(i) });
      i = end;
    } else if (/[A-Za-z_]/.test(c)) {
      IDENT.lastIndex = i;
      const m = IDENT.exec(source)!;
      tokens.push({ type: "ident", value: m[0], col: col(i) });
      i = IDENT.lastIndex;
    } else if (PUNCT.has(c)) {
      tokens.push({ type: "punct", value: c as Extract<Token, { type: "punct" }>["value"], col: col(i) });
      i++;
    } else {
      throw new LineError("syntax", `unexpected character "${c}"`, col(i));
    }
  }

  tokens.push({ type: "eof", col: col(source.length) });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class TokenParser {
  private i = 0;
  /** Lists, objects and calls open inside the current value [4.13]. */
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  callStatement(id: string): RawStatement {
    const callee = this.peek();
    if (callee.type !== "ident" || this.peek(1).type !== "punct" || (this.peek(1) as { value: string }).value !== "(") {
      throw new LineError("syntax", "expected a component call such as Text(…)", callee.col);
    }
    this.i++;
    const { args, named } = this.argumentList();
    this.expectEnd();
    return { kind: "call", id, callee: callee.value, args, named };
  }

  stateStatement(key: string): RawStatement {
    if (this.peek().type === "eof") throw new LineError("syntax", "expected a value", this.peek().col);
    const value = this.value();
    this.expectEnd();
    return { kind: "state", key, value };
  }

  /** `( [arg {, arg}] [,] )` where named args (`name = value`) come after positional ones. */
  private argumentList(): { args: RawValue[]; named: [string, RawValue][] } {
    this.expectPunct("(");
    const args: RawValue[] = [];
    const named: [string, RawValue][] = [];
    while (!this.atPunct(")")) {
      const token = this.peek();
      if (token.type === "ident" && this.atPunct("=", 1)) {
        this.i += 2;
        named.push([token.value, this.value()]);
      } else {
        if (named.length > 0) {
          throw new LineError("syntax", "positional arguments must come before named ones", token.col);
        }
        args.push(this.value());
      }
      if (!this.atPunct(")")) this.expectPunct(",");
    }
    this.expectPunct(")");
    return { args, named };
  }

  private value(): RawValue {
    const token = this.peek();
    switch (token.type) {
      case "string":
        this.i++;
        return { kind: "string", value: token.value };
      case "number":
        this.i++;
        return { kind: "number", value: token.value };
      case "state":
        this.i++;
        return { kind: "state", key: token.value };
      case "ident":
        this.i++;
        if (token.value === "true" || token.value === "false") return { kind: "boolean", value: token.value === "true" };
        if (token.value === "null") return { kind: "null" };
        if (this.atPunct("(")) {
          this.nested(token.col, () => this.argumentList()); // parsed for well-formedness, then rejected by the schema
          return { kind: "call", callee: token.value };
        }
        return { kind: "ident", name: token.value };
      case "punct":
        if (token.value === "[") return this.nested(token.col, () => this.array());
        if (token.value === "{") return this.nested(token.col, () => this.object());
        throw new LineError("syntax", `unexpected "${token.value}"`, token.col);
      case "eof":
        throw new LineError("syntax", "line ended where a value was expected", token.col);
    }
  }

  /** Run `parse` one nesting level deeper, refusing to go past the limit before recursing [4.13]. */
  private nested<T>(col: number, parse: () => T): T {
    if (this.depth >= LIMITS.nestingDepth) {
      throw new LineError("syntax", `values may nest at most ${LIMITS.nestingDepth} levels deep`, col);
    }
    this.depth++;
    try {
      return parse();
    } finally {
      this.depth--;
    }
  }

  private array(): RawValue {
    this.expectPunct("[");
    const items: RawValue[] = [];
    while (!this.atPunct("]")) {
      items.push(this.value());
      if (!this.atPunct("]")) this.expectPunct(",");
    }
    this.expectPunct("]");
    return { kind: "array", items };
  }

  private object(): RawValue {
    this.expectPunct("{");
    const entries: [string, RawValue][] = [];
    while (!this.atPunct("}")) {
      const key = this.peek();
      if (key.type !== "ident" && key.type !== "string") {
        throw new LineError("syntax", "expected an object key", key.col);
      }
      this.i++;
      this.expectPunct(":");
      entries.push([key.value, this.value()]);
      if (!this.atPunct("}")) this.expectPunct(",");
    }
    this.expectPunct("}");
    return { kind: "object", entries };
  }

  private peek(ahead = 0): Token {
    return this.tokens[Math.min(this.i + ahead, this.tokens.length - 1)]!;
  }

  private atPunct(value: string, ahead = 0): boolean {
    const token = this.peek(ahead);
    return token.type === "punct" && token.value === value;
  }

  private expectPunct(value: string): void {
    const token = this.peek();
    if (!this.atPunct(value)) {
      const found = token.type === "eof" ? "end of line" : `"${token.value}"`;
      throw new LineError("syntax", `expected "${value}" but found ${found}`, token.col);
    }
    this.i++;
  }

  private expectEnd(): void {
    const token = this.peek();
    if (token.type !== "eof") throw new LineError("syntax", "unexpected text after the statement", token.col);
  }
}
