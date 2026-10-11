/// <reference types="vite/client" />
// The "Use your own AI" tab (PLAN-QUICKSTART.md, Track 1): a visitor copies the instructions into
// their own AI chat, pastes the reply back, and sees it drawn. Nothing here talks to a server.
import { buildSystemPrompt } from "@omni-ir/core";
import { ASSETS } from "../app/assets";
import { APP_COMPONENTS, PICTURES } from "../app/components";
import { LIVE_PARTS } from "../app/live";
import { TOOLS } from "../app/tools";
import paymentConfirmation from "../fixtures/payment-confirmation.omni?raw";
import signIn from "../fixtures/sign-in.omni?raw";
import orderStatus from "../fixtures/order-status.omni?raw";
import type { LineIssue } from "./usePlayground";

/** Ideas for a first screen, shown as one-tap chips. */
export const IDEAS = [
  "a booking form for a dog-grooming salon",
  "a gym membership sign-up",
  "this week's sales for a coffee shop",
  "a feedback survey after a hotel stay",
];

/** Where a visitor can ask: plain links, nothing sent with them. */
export const CHATS = [
  { name: "ChatGPT", href: "https://chatgpt.com/" },
  { name: "Claude", href: "https://claude.ai/new" },
  { name: "Gemini", href: "https://gemini.google.com/app" },
];

const example = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .trim();

/** The reference server's system prompt, built in the browser: the demo app's tools, pictures and components. */
export function playgroundPrompt(): string {
  return buildSystemPrompt({
    tools: TOOLS,
    assets: ASSETS,
    components: APP_COMPONENTS,
    pictures: PICTURES,
    live: LIVE_PARTS,
    examples: [paymentConfirmation, signIn, orderStatus].map(example),
  });
}

/** What the visitor copies into their AI chat: the instructions, then their request. */
export function instructionsFor(request: string): string {
  // Chat apps show code fences as a code block with its own copy button, which copies the lines
  // exactly; formatted text gets Markdown's backslashes. The playground removes the fences again.
  return `${playgroundPrompt()}
You're answering in a chat app: this time, put all the lines in one code block (between \`\`\` lines), with nothing before or after it, so they can be copied exactly.

Screen to build: ${request.trim()}
`;
}

// A statement (`id = …`, `$key = …`) or a comment. Anything else in a chat reply is the AI talking.
const STATEMENT = /^(#|\$?[A-Za-z_][A-Za-z0-9_]*\s*=)/;
// A number a chat app or code viewer put in front of a line: "1. ", "2 ", "3) ".
const LINE_NUMBER = /^\d+[.):]?\s+(?=[$#A-Za-z_])/;
// Markdown's backslash before punctuation, added when formatted chat text is copied. Omni-IR's own
// escapes are \" \\ and \n, so a backslash before any of these is never valid Omni-IR.
const MARKDOWN_ESCAPE = /(?<!\\)\\([[\]_*#\-.!(){}<>~`|+])/g;
const STARTS_STATEMENT = /^(\$?[A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/;

/** Splits statements that arrived joined on one line: at a name and `=` outside text and brackets. */
function splitJoined(line: string): string[] {
  const out: string[] = [];
  let start = 0;
  let depth = 0;
  let inText = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inText) {
      if (c === "\\") i++;
      else if (c === '"') inText = false;
      continue;
    }
    if (c === '"') inText = true;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && /\s/.test(c!) && line.slice(start, i).includes("=") && STARTS_STATEMENT.test(line.slice(i + 1))) {
      out.push(line.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(line.slice(start).trim());
  return out.filter((s) => s !== "");
}

/**
 * Chat apps wrap a reply in a friendly sentence and code fences, and copying formatted text adds
 * Markdown's backslashes and can join the lines. Keep the Omni-IR lines (broken ones too, so the
 * parser can explain them) and count what was dropped. This is the playground being kind; the parser
 * itself stays strict.
 */
export function tidyReply(reply: string): { source: string; dropped: number } {
  const kept: string[] = [];
  let dropped = 0;
  for (const raw of reply.split(/\r?\n/)) {
    const line = raw.trim().replace(LINE_NUMBER, "");
    if (line === "") continue;
    if (!STATEMENT.test(line)) {
      dropped++;
      continue;
    }
    if (line.startsWith("#")) kept.push(line);
    else kept.push(...splitJoined(line.replace(MARKDOWN_ESCAPE, "$1")));
  }
  return { source: kept.join("\n"), dropped };
}

/** The longest screen a share link carries, in characters (a typical screen is 1–2 KB). */
export const MAX_SHARED = 16_000;
const SHARE_KEY = "#screen=";

/** A link that opens this screen for anyone. The lines travel after `#`, which browsers never send to a server. */
export function shareLink(pageUrl: string, source: string): string {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${pageUrl.split("#")[0]}${SHARE_KEY}${encoded}`;
}

/** The screen in a share link's `#screen=…`, or undefined if there isn't a valid one. */
export function readShareLink(hash: string): string | undefined {
  if (!hash.startsWith(SHARE_KEY)) return undefined;
  const encoded = hash.slice(SHARE_KEY.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return undefined;
  try {
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const source = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    return source.length > MAX_SHARED ? undefined : source;
  } catch {
    return undefined;
  }
}

// Buttons drawn but kept off: the action isn't one this demo app allows.
const BUTTON_OFF = new Set(["unknown_tool", "ungoverned_mutation", "mutation_blocked", "mutation_target_not_interactive"]);

/** What happened to a pasted reply, in plain sentences for someone who has never seen Omni-IR. */
export function summarize({ lines, issues, dropped }: { lines: number; issues: readonly LineIssue[]; dropped: number }): string[] {
  const out: string[] = [];
  if (dropped > 0) out.push(`We removed ${dropped} line${dropped === 1 ? "" : "s"} that weren't Omni-IR, such as your AI's own sentences.`);
  const problems = new Set(issues.filter((i) => i.severity === "error" && !BUTTON_OFF.has(i.code)).map((i) => i.line ?? -1)).size;
  if (problems === 0) out.push(`All ${lines} line${lines === 1 ? " was" : "s were"} checked and drawn.`);
  else
    out.push(
      `${lines} line${lines === 1 ? " was" : "s were"} checked. ${problems} had a problem and ${problems === 1 ? "isn't" : "aren't"} drawn: you can paste the problems below back to your AI and ask it to fix them.`,
    );
  if (issues.some((i) => BUTTON_OFF.has(i.code)))
    out.push(
      "Some buttons are off: this demo app only allows a few actions, such as paying or returning an order. In your own app, you choose which actions the AI may use.",
    );
  return out;
}
