// The playground's "Use your own AI" tab (PLAN-QUICKSTART.md, Track 1): what a visitor copies, how a
// chat app's reply is tidied, and share links.
import { buildSystemPrompt as serverPrompt } from "../server/prompt";
import { instructionsFor, playgroundPrompt, readShareLink, shareLink, summarize, tidyReply, MAX_SHARED } from "../playground/ownAi";

describe("instructionsFor", () => {
  it("is the reference server's prompt with the visitor's request at the end", () => {
    expect(playgroundPrompt()).toBe(serverPrompt());
    const text = instructionsFor("  a booking form for a dog-grooming salon \n");
    expect(text.startsWith(serverPrompt())).toBe(true);
    expect(text.trimEnd().endsWith("Screen to build: a booking form for a dog-grooming salon")).toBe(true);
  });
});

describe("tidyReply", () => {
  it("keeps Omni-IR lines and drops a chat app's prose and code fences", () => {
    const reply = [
      "Here's your booking screen:",
      "",
      "```omni-ir",
      "root = Card([title, book])",
      'title = Heading("Book a groom")',
      "# the button",
      'book = Button("Book", action="book")',
      "```",
      "",
      "Let me know if you'd like changes!",
    ].join("\n");
    expect(tidyReply(reply)).toEqual({
      source: 'root = Card([title, book])\ntitle = Heading("Book a groom")\n# the button\nbook = Button("Book", action="book")',
      dropped: 4,
    });
  });

  it("leaves a clean reply exactly as it is, and keeps lines that are broken Omni-IR for the parser to explain", () => {
    expect(tidyReply('root = Card([a])\na = Text("Hi")')).toEqual({ source: 'root = Card([a])\na = Text("Hi")', dropped: 0 });
    expect(tidyReply('root = Card([a]\n$x = ')).toEqual({ source: "root = Card([a]\n$x =", dropped: 0 });
  });

  it("handles Windows line endings and indented lines", () => {
    expect(tidyReply('  root = Card([a])\r\n  a = Text("Hi")\r\n')).toEqual({ source: 'root = Card([a])\na = Text("Hi")', dropped: 0 });
  });
});

describe("share links", () => {
  it("round-trip any text, including quotes and non-English letters", () => {
    const source = 'root = Card([t])\nt = Heading("Café “Olá” ☕")';
    const link = shareLink("https://example.org/omni-ir/playground/", source);
    expect(link).toMatch(/^https:\/\/example\.org\/omni-ir\/playground\/#screen=[A-Za-z0-9_-]+$/);
    expect(readShareLink(new URL(link).hash)).toBe(source);
  });

  it("refuse what isn't a share link, is broken, or is too long", () => {
    expect(readShareLink("")).toBeUndefined();
    expect(readShareLink("#own-ai")).toBeUndefined();
    expect(readShareLink("#screen=***")).toBeUndefined();
    const huge = "a".repeat(MAX_SHARED + 1);
    expect(readShareLink(new URL(shareLink("https://x.test/", huge)).hash)).toBeUndefined();
  });
});

describe("summarize", () => {
  it("says everything was checked when nothing went wrong", () => {
    expect(summarize({ lines: 6, issues: [], dropped: 0 })).toEqual(["All 6 lines were checked and drawn."]);
  });

  it("explains, in plain sentences, what was dropped, what failed and why buttons are off", () => {
    const sentences = summarize({
      lines: 9,
      dropped: 2,
      issues: [
        { line: 4, severity: "error", code: "unknown_tool", message: 'Tool "salon.book" is not registered.' },
        { line: 7, severity: "error", code: "syntax", message: "Expected a closing bracket." },
      ],
    });
    expect(sentences).toEqual([
      "We removed 2 lines that weren't Omni-IR, such as your AI's own sentences.",
      "9 lines were checked. 1 had a problem and isn't drawn: you can paste the problems below back to your AI and ask it to fix them.",
      "Some buttons are off: this demo app only allows a few actions, such as paying or returning an order. In your own app, you choose which actions the AI may use.",
    ]);
  });
});

// From the owner's ChatGPT test (2026-10-11): ChatGPT answered without a code block, so copying its
// formatted reply escaped every "[" as "\[", and the lines can arrive joined into one.
describe("tidyReply, for replies copied from formatted chat text", () => {
  it("removes Markdown's backslashes, which are never valid Omni-IR, and keeps Omni-IR's own escapes", () => {
    const reply = String.raw`root = Stack(\[a, b\], gap="md")
a = Text("say \"hi\" \_now\_ \\[x\]")
b = Text("C:\\data\*")`;
    expect(tidyReply(reply).source).toBe(String.raw`root = Stack([a, b], gap="md")
a = Text("say \"hi\" _now_ \\[x]")
b = Text("C:\\data*")`);
  });

  it("splits statements that arrived on one line, never inside text", () => {
    const reply = String.raw`root = Stack(\[t, n\]) t = Heading("Price = 5") $n = "a b = c" n = Input($n, label="Note")`;
    expect(tidyReply(reply)).toEqual({
      source: 'root = Stack([t, n])\nt = Heading("Price = 5")\n$n = "a b = c"\nn = Input($n, label="Note")',
      dropped: 0,
    });
  });

  it("removes line numbers a chat app or code viewer added", () => {
    expect(tidyReply('1. root = Card([t])\n2 t = Heading("Hi")\n 3) $x = 4').source).toBe('root = Card([t])\nt = Heading("Hi")\n$x = 4');
  });
});

describe("instructionsFor, in a chat app", () => {
  it("asks for one code block, so the reply can be copied exactly", () => {
    expect(instructionsFor("a sign-in page")).toContain("put all the lines in one code block");
  });
});
