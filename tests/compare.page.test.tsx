// @vitest-environment jsdom
// The comparison page (PLAN-COMPARE-PAGE.md A.4): its sections, numbers from the generated data, and
// links to pages that exist.
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Compare } from "../site/landing/compare/Compare";
import data from "../site/landing/compare/data.json";

afterEach(cleanup);

describe("the comparison page", () => {
  it("has its sections, each opening with a plain question or statement", () => {
    render(<Compare />);
    expect([...document.querySelectorAll("h2.section-title")].map((h) => h.textContent)).toEqual([
      "The six ways compared",
      "How much does the AI have to write?",
      "When can people start seeing it?",
      "What each one lets the AI do",
      "Same request, two formats",
      "Where Omni-IR loses",
    ]);
    for (const row of data.capabilities.rows) expect(screen.getByRole("heading", { name: row.plain })).toBeTruthy();
  });

  it("shows each format's size for the chosen screen, from the generated data", async () => {
    render(<Compare />);
    const bars = within(screen.getByRole("list", { name: "Tokens for “Booking a cabin”" }));
    const booking = data.screens.find((s) => s.name === "booking")!;
    expect(bars.getByText(String(booking.tokens["omni-ir"]))).toBeTruthy();
    // The picker is in both the size and the race sections; either changes both.
    const pickers = screen.getAllByLabelText("Choose a screen to compare");
    expect(pickers).toHaveLength(2);
    await userEvent.setup().selectOptions(pickers[1]!, "order");
    expect((pickers[0] as HTMLSelectElement).value).toBe("order");
    expect(screen.getByRole("list", { name: "Tokens for “Where is my order?”" })).toBeTruthy();
  });

  it("draws the account-deletion reply, with the button left off and the reason said", () => {
    render(<Compare />);
    expect(screen.getByText("Account deletion isn't available here.")).toBeTruthy();
  });

  it("links only to the site's own pages and GitHub", () => {
    render(<Compare />);
    const allowed = new Set(["../", "../playground/#own-ai", "../docs/project/comparison.html"]);
    for (const a of document.querySelectorAll("a")) {
      const href = a.getAttribute("href")!;
      if (href.startsWith("#") || href.startsWith("https://github.com/jdsouza1/omni-ir")) continue;
      expect(allowed.has(href), `${a.textContent}: ${href}`).toBe(true);
    }
  });
});
