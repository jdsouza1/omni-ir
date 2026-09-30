// @vitest-environment jsdom
// Playground Task D: the source view.
import { cleanup, render, screen } from "@testing-library/react";
import { SourceView } from "../playground/SourceView";
import type { LineIssue } from "../playground/usePlayground";

afterEach(cleanup);

const lineEls = () => [...document.querySelectorAll<HTMLElement>(".pg-line")];
const lineText = (el: HTMLElement) => el.querySelector(".pg-line-text")!.textContent;

describe("SourceView", () => {
  it("shows a placeholder before any text arrives", () => {
    render(<SourceView source="" issues={[]} nodeLines={{}} streaming />);
    expect(screen.getByText("Omni-IR lines appear here as they arrive.")).toBeTruthy();
  });

  it("numbers every line from 1, keeping blank and comment lines, and strips CR", () => {
    render(<SourceView source={"# heading\r\n\nroot = Divider()\n"} issues={[]} nodeLines={{ root: 3 }} streaming={false} />);
    const els = lineEls();
    expect(els.map((el) => el.dataset.line)).toEqual(["1", "2", "3"]);
    expect(els.map(lineText)).toEqual(["# heading", "", "root = Divider()"]);
    expect(els.map((el) => el.querySelector(".pg-line-number")!.textContent)).toEqual(["1", "2", "3"]);
  });

  it("marks the unfinished last line while streaming, and not after", () => {
    const { rerender } = render(<SourceView source={'root = Card([a])\na = Hea'} issues={[]} nodeLines={{ root: 1 }} streaming />);
    expect(lineEls().map((el) => el.dataset.partial)).toEqual([undefined, "true"]);
    rerender(<SourceView source={'root = Card([a])\na = Hea'} issues={[]} nodeLines={{ root: 1 }} streaming={false} />);
    expect(lineEls().map((el) => el.dataset.partial)).toEqual([undefined, undefined]);
  });

  it("puts errors and warnings on their line, and lineless issues under Document issues", () => {
    const issues: LineIssue[] = [
      { line: 2, severity: "error", code: "unknown_component", message: '"Iframe" is not in the Trusted Catalog' },
      { line: 3, severity: "warning", code: "unknown_escape", message: 'unknown escape "\\d" kept as literal text' },
      { line: undefined, severity: "error", code: "missing_root", message: 'no "root = …" line was received' },
    ];
    render(<SourceView source={'a = Divider()\nx = Iframe("u")\nt = Text("C:\\data")\n'} issues={issues} nodeLines={{ a: 1, t: 3 }} streaming={false} />);
    const [one, two, three] = lineEls();
    expect(one!.dataset.severity).toBeUndefined();
    expect(two!.dataset.severity).toBe("error");
    expect(two!.textContent).toContain('Error (unknown_component): "Iframe" is not in the Trusted Catalog');
    expect(three!.dataset.severity).toBe("warning");
    expect(three!.textContent).toContain("Warning (unknown_escape)");
    expect(screen.getByRole("heading", { name: "Document issues" })).toBeTruthy();
    expect(screen.getByText(/missing_root/)).toBeTruthy();
  });

  it("records which node each line defines; only component lines are focusable", () => {
    render(<SourceView source={'$v = ""\nroot = Input($v, label="L")\n# note\n'} issues={[]} nodeLines={{ $v: 1, root: 2 }} streaming={false} />);
    const [state, root, comment] = lineEls();
    expect(state!.dataset.defines).toBe("$v");
    expect(state!.tabIndex).toBe(-1);
    expect(root!.dataset.defines).toBe("root");
    expect(root!.tabIndex).toBe(0);
    expect(root!.getAttribute("aria-label")).toBe("Line 2, defines root");
    expect(comment!.dataset.defines).toBeUndefined();
  });

  it("shows markup in the stream as plain text", () => {
    render(<SourceView source={'<img src=x onerror=alert(1)>\n'} issues={[]} nodeLines={{}} streaming={false} />);
    expect(document.querySelector("img")).toBeNull();
    expect(lineText(lineEls()[0]!)).toBe("<img src=x onerror=alert(1)>");
  });
});
