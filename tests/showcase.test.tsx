// @vitest-environment jsdom
// The showcase page (PLAN-SHOWCASE.md): every entry is checked (streams parse with the demo app's
// registries, screenshots exist and fit the budget), what each app uses comes from its stream, and the
// page shows the apps, filters them by platform and draws the stream on request.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IMAGE_BUDGET_BYTES, loadShowcase, SHOTS_DIR } from "../scripts/showcase";
import { LINKS, Showcase } from "../site/landing/showcase/Showcase";

const apps = loadShowcase(".");
beforeAll(() => vi.stubGlobal("__SHOWCASE__", apps));
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe("the showcase entries", () => {
  it("starts with what exists today: the shop and dashboard on three platforms, the playground, the element and the MCP view", () => {
    expect(apps.map((a) => [a.id, a.platforms])).toEqual([
      ["shop", ["web", "ios", "android"]],
      ["dashboard", ["web", "ios", "android"]],
      ["playground", ["web"]],
      ["elements", ["web"]],
      ["chat", ["chat"]],
    ]);
  });

  it("reads what each app uses from its stream, never from a hand-written list", () => {
    const shop = apps.find((a) => a.id === "shop")!;
    expect(shop.catalog).toEqual(["Card", "Heading", "Button"]);
    expect(shop.components).toEqual(["ProductCard", "QuantityPicker"]);
    expect(apps.find((a) => a.id === "dashboard")!.catalog).toEqual(expect.arrayContaining(["BarChart", "LineChart", "Series", "Notice"]));
    expect(apps.find((a) => a.id === "elements")!.components).toEqual(["ProductCard"]);
  });

  it("keeps every screenshot, and only those, within the image budget", () => {
    const files = readdirSync(SHOTS_DIR);
    const used = apps.flatMap((a) => a.platforms.map((p) => a.shots[p]!));
    expect(files.sort()).toEqual([...used].sort());
    const total = files.reduce((n, f) => n + statSync(join(SHOTS_DIR, f)).size, 0);
    expect(total).toBeLessThanOrEqual(IMAGE_BUDGET_BYTES);
    for (const f of files) expect(f).toMatch(/\.webp$/);
  });
});

describe("the showcase page", () => {
  it("shows every app, each with a plain sentence first", () => {
    render(<Showcase />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Built with Omni-IR");
    const articles = screen.getAllByRole("article");
    expect(articles.map((a) => within(a).getByRole("heading", { level: 2 }).textContent)).toEqual(apps.map((a) => a.name));
    for (const app of apps) expect(screen.getByText(app.summary)).toBeTruthy();
  });

  it("filters by platform", async () => {
    render(<Showcase />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "iPhone" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByText("2 of 5 apps")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Inside an AI chat" }));
    expect(screen.getAllByRole("article").map((a) => within(a).getByRole("heading", { level: 2 }).textContent)).toEqual(["Inside an AI chat"]);
    await user.click(screen.getByRole("button", { name: "Everywhere" }));
    expect(screen.getAllByRole("article")).toHaveLength(5);
  });

  it("shows the stream only on request, and draws it with the real renderer", async () => {
    render(<Showcase />);
    const shop = screen.getAllByRole("article")[0]!;
    expect(within(shop).queryByLabelText("What the AI wrote for Product page")).toBeNull();
    await userEvent.setup().click(within(shop).getByRole("button", { name: "See what the AI wrote" }));
    expect(within(shop).getByLabelText("What the AI wrote for Product page").textContent).toContain('ProductCard("Canvas tote"');
    expect(within(shop).getByRole("button", { name: "Add to bag" })).toBeTruthy();
  });

  it("gives every screenshot a description and a platform", () => {
    render(<Showcase />);
    const images = screen.getAllByRole("img");
    expect(images.map((i) => i.getAttribute("src"))).toEqual(apps.flatMap((a) => a.platforms.map((p) => a.shots[p])));
    for (const img of images) expect(img.getAttribute("alt")).toMatch(/, as drawn (on|inside) /);
  });

  it("links only to the site's own pages and to GitHub", () => {
    render(<Showcase />);
    const ownPages = new Set(["../", "../compare/", "../playground/", "../playground/#own-ai", "../#demo", "../elements/", "#main"]);
    for (const a of document.querySelectorAll("a")) {
      const href = a.getAttribute("href")!;
      if (href.startsWith("https://github.com/jdsouza1/omni-ir")) continue;
      expect(ownPages.has(href), `${a.textContent}: ${href}`).toBe(true);
    }
    expect(screen.getByRole("link", { name: "Add your app" }).getAttribute("href")).toBe(LINKS.submit);
  });
});
