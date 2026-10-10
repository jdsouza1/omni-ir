// Random and broken Omni-IR streams for fuzz testing (PLAN-HARDENING.md, B). Shared by the
// fast-check properties (tests/fuzz.test.ts) and the differential corpus (fuzz/build.ts).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { COMPONENT_TYPES, componentDeclarations } from "@omni-ir/core";
import { APP_COMPONENTS, PICTURES } from "../app/components";

/** Every fixture the mock model streams, plus the failure variants and the landing examples. */
export function fixtureTexts(dir = "fixtures"): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...fixtureTexts(path));
    else if (entry.name.endsWith(".omni")) out.push(readFileSync(path, "utf8"));
  }
  return out;
}

const ids = fc.constantFrom("root", "a", "b", "title", "pay", "payM", "list", "row1", "tab", "x_1", "Root", "_", "9bad", "__proto__", "constructor", "true", "a".repeat(70));
const stateKeys = fc.constantFrom("$amount", "$note", "$x", "$", "$9", "$__proto__", `$${"k".repeat(70)}`);
const componentNames = fc.oneof(
  fc.constantFrom(...COMPONENT_TYPES, "McpMutation"),
  fc.constantFrom("ProductCard", "QuantityPicker", "App"),
  fc.constantFrom("Div", "script", "card", "Button2", "Html", ""),
);
const numbers = fc.oneof(
  fc.integer().map(String),
  fc.double({ noNaN: false }).map(String),
  fc.constantFrom("1e999", "-0", "0x10", "1_000", ".5", "5.", "01", "NaN", "Infinity", "-Infinity", "1e-400", "9".repeat(400)),
);
const quoted = fc.oneof(
  fc.string({ maxLength: 40 }).map((s) => JSON.stringify(s)),
  fc.string({ unit: "binary", maxLength: 20 }).map((s) => `"${s}"`),
  fc.constantFrom('"unterminated', '"a\\"b"', '"\\u0041"', '"tab\there"', '"\\', '""', `"${"x".repeat(2100)}"`, '"<script>alert(1)</script>"', '"C:\\\\data"', '"\\n"'),
);

/** Something in argument position: values, references, lists, objects, or junk. */
const argument: fc.Arbitrary<string> = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: "small" },
    quoted,
    numbers,
    fc.constantFrom("true", "false", "null", "undefined", "TRUE"),
    ids,
    stateKeys,
    fc.array(tie("value") as fc.Arbitrary<string>, { maxLength: 4 }).map((xs) => `[${xs.join(", ")}]`),
    fc.array(fc.tuple(fc.constantFrom("amount", "note", "__proto__", "a b", "x"), tie("value") as fc.Arbitrary<string>), { maxLength: 3 }).map((kv) => `{${kv.map(([k, v]) => `${k}: ${v}`).join(", ")}}`),
    fc.tuple(fc.constantFrom("label", "tone", "format", "action", "tool", "params", "style", "class", "onClick", "variant", "alt", "lines", "price", "picture", "min", "max", "badges"), tie("value") as fc.Arbitrary<string>).map(([k, v]) => `${k}=${v}`),
    fc.constantFrom('"product-1042"', '"product-x"', '"https://e.com/p.png"'),
    fc.constantFrom("(", ")", "[", "]", "{", "}", ",", "=", "+", "$a + 1", "Card(", "a.b", "...", "/*", "#"),
  ),
})).value as fc.Arbitrary<string>;

/** One line: a component, a state declaration, a comment, or something that looks almost right. */
export const line: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(ids, componentNames, fc.array(argument, { maxLength: 5 })).map(([id, c, args]) => `${id} = ${c}(${args.join(", ")})`),
  fc.tuple(stateKeys, argument).map(([k, v]) => `${k} = ${v}`),
  fc.tuple(ids, argument).map(([id, v]) => `${id} = ${v}`),
  fc.string({ maxLength: 60 }).map((s) => `# ${s}`),
  fc.string({ unit: "binary", maxLength: 80 }),
  fc.constantFrom("", " ", "\t", "root = ", "= Card([])", "root Card([])", "root = Card([a]) b = Text(\"x\")", "root = Card([a]", "```", "<div>hi</div>", "\uFEFFroot = Text(\"bom\")"),
);

const endings = fc.constantFrom("\n", "\r\n", "\r", "\n\n");

/** A whole stream of plausible and broken lines, with mixed line endings. */
export const stream: fc.Arbitrary<string> = fc
  .array(fc.tuple(line, endings), { maxLength: 40 })
  .chain((lines) => fc.boolean().map((endsCleanly) => lines.map(([l, e]) => l + e).join("") + (endsCleanly ? "" : "root = Text(\"cut")));

/** A real fixture with random edits: deleted, inserted, duplicated or swapped text, or cut short. */
export function mutatedFixture(fixtures: readonly string[]): fc.Arbitrary<string> {
  const edit = fc.oneof(
    fc.tuple(fc.nat(), fc.nat({ max: 20 })).map(([at, n]) => (t: string) => t.slice(0, at % (t.length + 1)) + t.slice((at % (t.length + 1)) + n)),
    fc.tuple(fc.nat(), argument).map(([at, s]) => (t: string) => t.slice(0, at % (t.length + 1)) + s + t.slice(at % (t.length + 1))),
    fc.tuple(fc.nat(), fc.nat()).map(([i, j]) => (t: string) => {
      const ls = t.split("\n");
      const [a, b] = [i % ls.length, j % ls.length];
      [ls[a], ls[b]] = [ls[b]!, ls[a]!];
      return ls.join("\n");
    }),
    fc.nat().map((i) => (t: string) => {
      const ls = t.split("\n");
      ls.splice(i % ls.length, 0, ls[i % ls.length]!);
      return ls.join("\n");
    }),
    fc.nat().map((at) => (t: string) => t.slice(0, at % (t.length + 1))),
  );
  return fc.tuple(fc.constantFrom(...fixtures), fc.array(edit, { minLength: 1, maxLength: 5 })).map(([t, edits]) => edits.reduce((acc, f) => f(acc), t));
}

/** Byte positions to split a stream at, as a network might. */
export const splitPoints = fc.array(fc.nat(), { maxLength: 12 });

/** Split bytes at the given positions (taken modulo the length), keeping order. */
export function splitBytes(bytes: Uint8Array, points: readonly number[]): Uint8Array[] {
  const cuts = [...new Set(points.map((p) => (bytes.length === 0 ? 0 : p % bytes.length)))].sort((a, b) => a - b);
  const parts: Uint8Array[] = [];
  let from = 0;
  for (const at of cuts) {
    parts.push(bytes.subarray(from, at));
    from = at;
  }
  parts.push(bytes.subarray(from));
  return parts;
}

/** The tools and pictures the fixtures use, so mutated fixtures exercise the real rules. */
export const FUZZ_TOOLS = [
  "payments.confirm",
  "auth.sendMagicLink",
  "profile.update",
  "orders.requestReturn",
  "support.createTicket",
  "bookings.reserve",
  "assistant.ask",
  "settings.update",
  "cart.add",
] as const;
export const FUZZ_ASSETS = ["cabin-pines", "shirt", "tote"] as const;
/** The demo app's own components and picture patterns (Step 20), as plain JSON. */
export const FUZZ_COMPONENTS = componentDeclarations(APP_COMPONENTS);
export const FUZZ_PICTURES = PICTURES;
