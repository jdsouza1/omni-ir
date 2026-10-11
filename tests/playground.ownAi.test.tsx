// @vitest-environment jsdom
// The "Use your own AI" tab walked the way a visitor would (PLAN-QUICKSTART.md, Track 1): pick an idea,
// copy the instructions, paste a chat app's reply, see the screen and the plain-sentence summary, share it.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Playground } from "../playground/Playground";

const healthFetch: typeof fetch = async (input) => {
  if (String(input).endsWith("/api/health")) return new Response(JSON.stringify({ ok: true, model: "mock" }));
  return new Response("{}", { status: 404 });
};

let clipboard = "";
/** After userEvent.setup(), which puts in its own clipboard: record what the page copies. */
function recordClipboard() {
  clipboard = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text: string) => void (clipboard = text) },
  });
}
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const REPLY = [
  "Sure! Here's a booking screen for your salon:",
  "```",
  "root = Card([title, when, book])",
  'title = Heading("Book a groom")',
  '$when = ""',
  'when = DateInput($when, label="Day")',
  'book = Button("Book", action="book")',
  'bookM = McpMutation(book, tool="salon.book", params={day: $when})',
  "```",
  "Let me know if you want changes.",
].join("\n");

async function openOwnAi() {
  window.history.replaceState(null, "", "/#own-ai");
  render(<Playground fetch={healthFetch} />);
  await screen.findByText("mock model · free");
  const user = userEvent.setup();
  recordClipboard();
  return user;
}

describe("Use your own AI", () => {
  it("opens from #own-ai with only the three steps showing", async () => {
    await openOwnAi();
    expect(screen.getByRole("tab", { name: "Use your own AI" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["What screen do you want?", "Ask your AI", "Paste its reply"]);
    expect(screen.queryByLabelText("Rendered screen")).toBeNull();
    expect(screen.getByRole("button", { name: "Copy instructions" }).hasAttribute("disabled")).toBe(true);
  });

  it("copies the instructions with the visitor's request, then draws a pasted reply and explains it", async () => {
    const user = await openOwnAi();
    await user.click(screen.getByRole("button", { name: "a booking form for a dog-grooming salon" }));
    await user.click(screen.getByRole("button", { name: "Copy instructions" }));
    expect(clipboard).toContain("You write user interfaces in Omni-IR");
    expect(clipboard.trimEnd().endsWith("Screen to build: a booking form for a dog-grooming salon")).toBe(true);
    expect(screen.getByText("Copied. Paste it into your AI's chat and send it.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open ChatGPT" }).getAttribute("href")).toBe("https://chatgpt.com/");

    fireEvent.change(screen.getByLabelText("Paste its reply"), { target: { value: REPLY } });
    await user.click(screen.getByRole("button", { name: "Show my screen" }));
    const result = await screen.findByRole("region", { name: "What we checked" }, { timeout: 3000 });
    expect([...result.querySelectorAll("p")].map((p) => p.textContent)).toEqual([
      "We removed 4 lines that weren't Omni-IR, such as your AI's own sentences.",
      "All 6 lines were checked and drawn.",
      "Some buttons are off: this demo app only allows a few actions, such as paying or returning an order. In your own app, you choose which actions the AI may use.",
    ]);
    const preview = within(screen.getByLabelText("Rendered screen"));
    expect(preview.getByText("Book a groom")).toBeTruthy();
    expect((preview.getByRole("button", { name: "Book" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lists problems and copies them for the AI to fix", async () => {
    const user = await openOwnAi();
    fireEvent.change(screen.getByLabelText("Paste its reply"), { target: { value: 'root = Card([title])\ntitle = Heading("Hi"' } });
    await user.click(screen.getByRole("button", { name: "Show my screen" }));
    const result = await screen.findByRole("region", { name: "What we checked" }, { timeout: 3000 });
    // The cut-off line, and root waiting for the title that never arrived.
    expect(result.textContent).toContain("2 lines were checked. 2 had a problem and aren't drawn");
    expect(within(result).getAllByRole("listitem").length).toBeGreaterThan(0);
    await user.click(within(result).getByRole("button", { name: "Copy the problems for your AI" }));
    expect(clipboard).toMatch(/^Please fix these problems in your Omni-IR reply/);
    expect(clipboard).toContain("Line 2:");
  });

  it("shares a screen as a link that draws it for the next visitor", async () => {
    const user = await openOwnAi();
    fireEvent.change(screen.getByLabelText("Paste its reply"), { target: { value: REPLY } });
    await user.click(screen.getByRole("button", { name: "Show my screen" }));
    await screen.findByRole("region", { name: "What we checked" }, { timeout: 3000 });
    await user.click(screen.getByRole("button", { name: "Share this screen" }));
    expect(clipboard).toMatch(/#screen=[A-Za-z0-9_-]+$/);
    expect(screen.getByRole("button", { name: "Link copied" })).toBeTruthy();

    cleanup();
    window.history.replaceState(null, "", new URL(clipboard).hash);
    render(<Playground fetch={healthFetch} />);
    await screen.findByRole("region", { name: "What we checked" }, { timeout: 3000 });
    expect(within(screen.getByLabelText("Rendered screen")).getByText("Book a groom")).toBeTruthy();
    expect((screen.getByLabelText("Paste its reply") as HTMLTextAreaElement).value).toContain('title = Heading("Book a groom")');
    expect(screen.getByText(/^Someone shared this screen with you/)).toBeTruthy();
  });

  it("draws a reply a line at a time, like a stream", async () => {
    const user = await openOwnAi();
    fireEvent.change(screen.getByLabelText("Paste its reply"), { target: { value: REPLY } });
    await user.click(screen.getByRole("button", { name: "Show my screen" }));
    expect(document.querySelector(".pg-status")?.textContent ?? "").toMatch(/^Drawing… \d+ lines? so far$/);
    await screen.findByRole("region", { name: "What we checked" }, { timeout: 3000 });
  });
});
