// npm run demo                                  stream fixtures/payment-confirmation.omni locally
// npm run demo -- fixtures/variants/<name>.omni stream another file locally
// npm run demo -- --server "where is my order?" stream from a running server (npm run server)
//                  [--url http://localhost:8787]
// Prints every parser event as it happens, then the server-rendered HTML mid-stream and at the end.
import { readFileSync } from "node:fs";
import { mockStream } from "../app/mockStream";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { generate } from "../client/generate";
import { createParser } from "../engine/parser";
import { bold, dim, eventPrinter, green, red, renderHtml } from "./lib";

const args = process.argv.slice(2);
const serverIndex = args.indexOf("--server");
const urlIndex = args.indexOf("--url");
const baseUrl = urlIndex >= 0 ? args[urlIndex + 1]! : "http://localhost:8787";

const parser = createParser({ tools: TOOLS, assets: ASSETS });
const started = performance.now();
parser.subscribe(eventPrinter(started));

let midwayShown = false;
const showMidway = () => {
  const doc = parser.getSnapshot();
  if (!midwayShown && doc.nodes.has("root") && doc.pending.size >= 2) {
    midwayShown = true;
    console.log(bold("\n── Mid-stream render (pending children shown as Skeletons) ──"));
    console.log(renderHtml(parser) + "\n");
  }
};
parser.subscribe((event) => event.type === "node" && showMidway());

let issuesCount: number;
if (serverIndex >= 0) {
  const prompt = args[serverIndex + 1] ?? "a payment confirmation";
  console.log(bold(`\nAsking ${baseUrl} for: ${JSON.stringify(prompt)}\n`));
  const outcome = await generate(prompt, { parser, baseUrl });
  if (outcome.status === "error") {
    console.log(red(`\n✗ ${outcome.code}: ${outcome.message}`));
    if (outcome.code === "network_error") console.log(dim("  Is the server running? Start it with: npm run server"));
    // Nothing streamed (the request itself failed): there is no document to report on.
    if (!parser.getSnapshot().complete) process.exit(1);
  } else if (outcome.status === "done") {
    console.log(dim(`\nserver: done (${outcome.stopReason}, model ${outcome.model}, ${outcome.ms} ms)`));
  }
  issuesCount = parser.getSnapshot().complete ? parser.end().length : 0;
} else {
  const path = args[0] ?? "fixtures/payment-confirmation.omni";
  console.log(bold(`\nStreaming ${path}\n`));
  for await (const chunk of mockStream(readFileSync(path, "utf8"), { seed: 7, maxChunk: 14, maxDelayMs: 25 })) {
    parser.write(chunk);
  }
  issuesCount = parser.end().length;
}

if (parser.getSnapshot().nodes.size > 0) {
  console.log(bold("\n── Final render ──"));
  console.log(renderHtml(parser));
}
console.log(
  bold(`\n${issuesCount === 0 ? green("✓ document complete, no issues") : red(`✗ ${issuesCount} end-of-stream issue(s)`)}`) +
    dim(`  (${Math.round(performance.now() - started)} ms)\n`),
);
