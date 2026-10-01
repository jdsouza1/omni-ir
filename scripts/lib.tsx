// Shared terminal helpers for the demo and validate scripts.
import { renderToString } from "react-dom/server";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import type { OmniParser, ParserEvent } from "@omni-ir/core";
import { OmniRenderer } from "@omni-ir/react";

const tty = process.stdout.isTTY;
const color = (code: number) => (text: string) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text);
export const dim = color(2);
export const red = color(31);
export const yellow = color(33);
export const green = color(32);
export const cyan = color(36);
export const bold = color(1);

/** Prints parser events as they happen, with time since `started` (performance.now()). */
export function eventPrinter(started: number) {
  return (event: ParserEvent) => {
    const t = dim(`${String(Math.round(performance.now() - started)).padStart(5)}ms`);
    const at = (line?: number) => (line ? dim(` (line ${line})`) : "");
    switch (event.type) {
      case "node":
        return console.log(`${t}  ${green("node    ")} ${event.id}${at(event.line)}`);
      case "pending":
        return console.log(`${t}  ${cyan("pending ")} ${event.id} ${dim("→ Skeleton")}`);
      case "resolved":
        return console.log(`${t}  ${cyan("resolved")} ${event.id}`);
      case "warning":
        return console.log(`${t}  ${yellow("warning ")} ${event.issue.code}: ${event.issue.message}${at(event.issue.line)}`);
      case "error":
        return console.log(`${t}  ${red("error   ")} ${event.issue.code}: ${event.issue.message}${at(event.issue.line)}`);
      case "end":
        return console.log(`${t}  ${bold("end")}`);
    }
  };
}

/** Server-render the parser's current document, indented one tag per line. */
export function renderHtml(parser: OmniParser): string {
  return prettyHtml(renderToString(<OmniRenderer store={parser.store} tools={TOOLS} assets={ASSETS} onMutation={() => {}} />));
}

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
