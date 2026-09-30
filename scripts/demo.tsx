// npm run demo [-- fixtures/variants/<name>.omni]
// Streams an Omni-IR fixture in random byte chunks, prints every parser event as it happens,
// then prints the server-rendered HTML mid-stream and at the end.
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { createParser, type ParserEvent } from "../engine/parser";
import { OmniRenderer } from "../renderer";
import { TOOLS } from "../tests/helpers";
import { mockStream } from "../tests/mockStream";

const path = process.argv[2] ?? "fixtures/payment-confirmation.omni";
const source = readFileSync(path, "utf8");
const tty = process.stdout.isTTY;
const color = (code: number) => (text: string) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text);
const [dim, red, yellow, green, cyan, bold] = [2, 31, 33, 32, 36, 1].map(color) as [
  (s: string) => string,
  (s: string) => string,
  (s: string) => string,
  (s: string) => string,
  (s: string) => string,
  (s: string) => string,
];

const parser = createParser({ tools: TOOLS });
parser.subscribe(printEvent);

const render = () =>
  renderToString(<OmniRenderer store={parser.store} tools={TOOLS} onMutation={() => {}} />);

console.log(bold(`\nStreaming ${path}\n`));
const started = performance.now();
let midwayShown = false;

for await (const chunk of mockStream(source, { seed: 7, maxChunk: 14, maxDelayMs: 25 })) {
  parser.write(chunk);
  const doc = parser.getSnapshot();
  if (!midwayShown && doc.nodes.has("root") && doc.pending.size >= 2) {
    midwayShown = true;
    console.log(bold("\n── Mid-stream render (pending children shown as Skeletons) ──"));
    console.log(prettyHtml(render()) + "\n");
  }
}
const issues = parser.end();

console.log(bold("\n── Final render ──"));
console.log(prettyHtml(render()));
console.log(
  bold(`\n${issues.length === 0 ? green("✓ document complete, no issues") : red(`✗ ${issues.length} end-of-stream issue(s)`)}`) +
    dim(`  (${Math.round(performance.now() - started)} ms)\n`),
);

function printEvent(event: ParserEvent) {
  const t = dim(`${String(Math.round(performance.now() - started)).padStart(5)}ms`);
  switch (event.type) {
    case "node":
      return console.log(`${t}  ${green("node    ")} ${event.id} ${dim(`(line ${event.line})`)}`);
    case "pending":
      return console.log(`${t}  ${cyan("pending ")} ${event.id} ${dim("→ Skeleton")}`);
    case "resolved":
      return console.log(`${t}  ${cyan("resolved")} ${event.id}`);
    case "warning":
      return console.log(`${t}  ${yellow("warning ")} ${event.issue.code}: ${event.issue.message} ${dim(`(line ${event.issue.line})`)}`);
    case "error":
      return console.log(`${t}  ${red("error   ")} ${event.issue.code}: ${event.issue.message}${event.issue.line ? dim(` (line ${event.issue.line})`) : ""}`);
    case "end":
      return console.log(`${t}  ${bold("end")}`);
  }
}

/** Indent server-rendered HTML one tag per line, for reading in a terminal. */
function prettyHtml(html: string): string {
  const VOID = /^<(hr|input|br|img)\b/;
  let depth = 0;
  return html
    .split(/(<[^>]+>)/)
    .filter((part) => part.trim() !== "")
    .map((part) => {
      if (part.startsWith("</")) depth--;
      const line = "  ".repeat(Math.max(depth, 0)) + part;
      if (part.startsWith("<") && !part.startsWith("</") && !VOID.test(part) && !part.endsWith("/>")) depth++;
      return line;
    })
    .join("\n");
}
