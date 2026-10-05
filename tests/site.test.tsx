// @vitest-environment jsdom
// The public site (Step 12, C and D): the docs pages assembled from the repo's Markdown, and the
// landing page. The full builds (VitePress, Vite) run in CI's site workflow; these check the parts
// that can go wrong quietly: links, generated pages, and the landing page's examples and links.
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { existsSync, readFileSync } from "node:fs";
import { loadLandingTabs } from "../scripts/landing-examples";
import { componentsPage, PAGES, rewriteLinks } from "../scripts/docs";

afterEach(cleanup);

describe("docs pages", () => {
  it("every source file exists", () => {
    for (const source of Object.keys(PAGES)) expect(existsSync(source), source).toBe(true);
  });

  it("links between repo files become links between docs pages; others go to GitHub", () => {
    const md = "[spec](../SPEC.md#5-document-rules) [cases](../conformance/README.md) [server](../server) [x](https://example.com) [top](#top)";
    expect(rewriteLinks(md, "docs/ARCHITECTURE.md", "guide/how-it-works.md")).toBe(
      "[spec](../spec.md#5-document-rules) [cases](../conformance.md) [server](https://github.com/jdsouza1/omni-ir/tree/main/server) [x](https://example.com) [top](#top)",
    );
  });

  it("no generated page links to a repo file that doesn't exist", () => {
    for (const [source, dest] of Object.entries(PAGES)) {
      const out = rewriteLinks(readFileSync(source, "utf8"), source, dest);
      for (const [, href] of out.matchAll(/\]\((https:\/\/github\.com\/jdsouza1\/omni-ir\/(?:blob|tree)\/main\/[^)#\s]+)/g)) {
        const path = decodeURIComponent(href!.replace(/^https:\/\/github\.com\/jdsouza1\/omni-ir\/(?:blob|tree)\/main\//, ""));
        expect(existsSync(path), `${source} links to missing ${path}`).toBe(true);
      }
    }
  });

  it("the Components page is the spec's generated catalog", () => {
    const page = componentsPage(readFileSync("SPEC.md", "utf8"));
    expect(page).toMatch(/^# Components/);
    for (const name of ["Stack", "Button", "BarChart", "Slice"]) expect(page).toContain(`### ${name}`);
    expect(page).not.toContain("## 7.");
  });
});

describe("landing page", () => {
  const tabs = loadLandingTabs(".");
  beforeAll(() => vi.stubGlobal("__LANDING_TABS__", tabs));
  afterAll(() => vi.unstubAllGlobals());

  async function open() {
    const { Landing } = await import("../site/landing/Landing");
    render(<Landing />);
    return userEvent.setup();
  }

  it("shows each example's real lines and switches tabs", async () => {
    const user = await open();
    const tablist = screen.getByRole("tablist", { name: "Example blueprints" });
    expect(within(tablist).getAllByRole("tab").map((t) => t.textContent)).toEqual(tabs.map((t) => t.label));
    for (const tab of tabs) {
      await user.click(within(tablist).getByRole("tab", { name: tab.label }));
      expect(document.querySelectorAll(".code-line")).toHaveLength(tab.lines.length);
    }
  });

  it("highlights the part a hovered line builds, and explains it", async () => {
    const user = await open();
    const lines = document.querySelectorAll<HTMLElement>(".code-line");
    await user.hover(lines[2]!);
    expect(screen.getByText(tabs[0]!.lines[2]!.explain)).toBeTruthy();
    expect(document.querySelector<HTMLElement>(".card-title")!.style.boxShadow).toContain("#6366f1");
  });

  it("every card part an example names is drawn on the page", () => {
    const source = readFileSync("site/landing/Landing.tsx", "utf8");
    for (const part of new Set(tabs.flatMap((t) => t.lines.map((l) => l.part)))) {
      if (part !== "root") expect(source, part).toContain(`ring("${part}")`);
    }
  });

  it("links point at the site's own pages, which the docs build produces", async () => {
    await open();
    const docsPages = new Set([...Object.values(PAGES), "guide/getting-started.md", "index.md"].map((p) => `docs/${p.replace(/\.md$/, ".html")}`));
    docsPages.add("docs/");
    for (const a of document.querySelectorAll("a")) {
      const href = a.getAttribute("href")!;
      if (href.startsWith("#") || href.startsWith("https://") || href === "./" || href === "playground/") continue;
      expect(docsPages.has(href), `${a.textContent}: ${href}`).toBe(true);
    }
    expect(screen.getByRole("link", { name: "Join the community" }).getAttribute("href")).toBe("https://github.com/jdsouza1/omni-ir/discussions");
  });
});
