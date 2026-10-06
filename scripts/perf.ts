// Parser performance on large screens (PLAN-HARDENING.md, C). Generates valid screens of a given
// size and times the TypeScript parser fed line by line, as a stream arrives.
//
//   npx tsx scripts/perf.ts            sizes 50, 200, 1000, 5000
//   npx tsx scripts/perf.ts 20000      other sizes
import { createParser } from "@omni-ir/core";
import { TOOLS } from "../app/tools";

/** A valid screen of about `n` components: root Stack -> groups of up to 200 -> Texts, a Button and its mutation. */
export function screen(n: number): string[] {
  const lines: string[] = [];
  const leaves = Math.max(1, n - 3);
  const groups = Math.ceil(leaves / 200);
  lines.push(`root = Stack([${Array.from({ length: groups }, (_, g) => `g${g}`).join(", ")}, pay])`);
  let made = 0;
  for (let g = 0; g < groups; g++) {
    const count = Math.min(200, leaves - made);
    lines.push(`g${g} = Stack([${Array.from({ length: count }, (_, k) => `t${made + k}`).join(", ")}])`);
    for (let k = 0; k < count; k++) lines.push(`t${made + k} = Text("Row ${made + k}", tone="muted")`);
    made += count;
  }
  lines.push("$amount = 42.5");
  lines.push('pay = Button("Pay", action="pay")');
  lines.push('payM = McpMutation(pay, tool="payments.confirm", params={amount: $amount, note: ""})');
  return lines;
}

export interface Timing {
  components: number;
  lines: number;
  totalMs: number;
  /** The slowest single line, which is what a user would feel as a stall. */
  worstLineMs: number;
  /** Time for the last 10% of lines, per line, to show growth as the document gets bigger. */
  lateLineMs: number;
  issues: number;
}

export function time(n: number): Timing {
  const lines = screen(n);
  const parser = createParser({ tools: TOOLS });
  let issues = 0;
  parser.subscribe((e) => {
    if (e.type === "error" || e.type === "warning") issues++;
  });
  const perLine: number[] = [];
  const start = performance.now();
  for (const line of lines) {
    const t = performance.now();
    parser.write(`${line}\n`);
    perLine.push(performance.now() - t);
  }
  parser.end();
  const totalMs = performance.now() - start;
  const late = perLine.slice(Math.floor(perLine.length * 0.9));
  return {
    components: parser.getSnapshot().nodes.size,
    lines: lines.length,
    totalMs,
    worstLineMs: Math.max(...perLine),
    lateLineMs: late.reduce((a, b) => a + b, 0) / late.length,
    issues,
  };
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/perf.ts")) {
  const sizes = process.argv.slice(2).map(Number).filter((n) => n > 0);
  time(200); // warm up the JIT
  console.log("components  lines   total ms  worst line ms  late line ms  issues");
  for (const n of sizes.length ? sizes : [50, 200, 1000, 5000]) {
    const r = time(n);
    console.log(
      `${String(r.components).padStart(10)}  ${String(r.lines).padStart(5)}  ${r.totalMs.toFixed(1).padStart(9)}  ${r.worstLineMs.toFixed(2).padStart(13)}  ${r.lateLineMs.toFixed(3).padStart(12)}  ${r.issues}`,
    );
  }
}
