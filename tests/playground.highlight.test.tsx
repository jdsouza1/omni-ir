// @vitest-environment jsdom
// Playground Task E: source ↔ preview highlighting, by mouse and by keyboard.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Playground } from "../playground/Playground";

afterEach(cleanup);

const healthFetch: typeof fetch = async () => new Response(JSON.stringify({ ok: true, model: "mock" }));

const SOURCE = [
  "root = Card([title, name, actions])",
  'title = Heading("Profile")',
  '$name = "Ada"',
  'name = Input($name, label="Name")',
  "actions = Stack([save])",
  'save = Button("Save")',
].join("\n");

async function renderPasted() {
  const user = userEvent.setup();
  render(<Playground generate={vi.fn()} fetch={healthFetch} />);
  await screen.findByText("mock model · free");
  await user.click(screen.getByRole("tab", { name: "Paste Omni-IR" }));
  fireEvent.change(screen.getByLabelText("Omni-IR lines"), { target: { value: SOURCE } });
  await user.click(screen.getByRole("button", { name: "Render" }));
  return user;
}

const line = (n: number) => document.querySelector<HTMLElement>(`.pg-line[data-line="${n}"]`)!;
const highlightedInPreview = () =>
  [...document.querySelectorAll("[data-pg-highlight]")].map((el) => el.getAttribute("data-node-id"));
const highlightedLines = () => [...document.querySelectorAll(".pg-line[data-highlighted]")].map((el) => el.getAttribute("data-line"));
const caption = () => document.querySelector(".pg-caption")!.textContent;

describe("source → preview", () => {
  it("hovering a line outlines what it builds and explains it", async () => {
    const user = await renderPasted();
    await user.hover(line(2));
    expect(highlightedInPreview()).toEqual(["title"]);
    expect(highlightedLines()).toEqual(["2"]);
    expect(caption()).toBe('Line 2 builds Heading "title"');
    await user.unhover(line(2));
    expect(highlightedInPreview()).toEqual([]);
    expect(caption()).toBe("Hover or focus a line to see what it builds.");
  });

  it("works from the keyboard: Tab reaches component lines, not the $state line", async () => {
    const user = await renderPasted();
    act(() => line(1).focus());
    expect(highlightedInPreview()).toEqual(["root"]);
    await user.tab();
    expect(document.activeElement).toBe(line(2));
    await user.tab();
    expect(document.activeElement).toBe(line(4)); // line 3 declares $name and isn't focusable
    expect(highlightedInPreview()).toEqual(["name"]);
  });
});

describe("preview → source", () => {
  it("hovering a nested component highlights its own line, not its parent's", async () => {
    const user = await renderPasted();
    await user.hover(screen.getByRole("heading", { name: "Profile" }));
    expect(highlightedLines()).toEqual(["2"]);
    await user.hover(screen.getByRole("button", { name: "Save" }));
    expect(highlightedLines()).toEqual(["6"]);
    expect(highlightedInPreview()).toEqual(["save"]);
  });

  it("focusing a control in the preview highlights its line", async () => {
    await renderPasted();
    fireEvent.focus(screen.getByLabelText("Name"));
    expect(highlightedLines()).toEqual(["4"]);
    fireEvent.blur(screen.getByLabelText("Name"));
    expect(highlightedLines()).toEqual([]);
  });

  it("a new run clears the highlight", async () => {
    const user = await renderPasted();
    await user.hover(line(2));
    fireEvent.change(screen.getByLabelText("Omni-IR lines"), { target: { value: 'root = Heading("Next")' } });
    await user.click(screen.getByRole("button", { name: "Render" }));
    expect(highlightedInPreview()).toEqual([]);
    expect(highlightedLines()).toEqual([]);
  });
});
