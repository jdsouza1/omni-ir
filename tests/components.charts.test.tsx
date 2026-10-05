// @vitest-environment jsdom
// Step 11: rendering BarChart, LineChart and PieChart with Series and Slice (PLAN-CHARTS.md, B.1).
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { formatValue, niceTicks } from "../packages/react/src/catalog/charts";
import { renderOmni } from "./renderHelpers";

afterEach(cleanup);

const bar = [
  'root = BarChart("Sales by month", ["Jul", "Aug", "Sep"], [online, store], format="currency")',
  'online = Series("Online", [1200, 1500, 1800])',
  'store = Series("In store", [900, 1100, 950])',
];

describe("BarChart", () => {
  it("draws one bar per value, with the title, a legend and the data as a table for screen readers", () => {
    const h = renderOmni({ lines: bar });
    const figure = h.container.querySelector('[data-node-id="root"]')!;
    expect(figure.querySelector("figcaption")?.textContent).toBe("Sales by month");
    expect(figure.querySelectorAll("svg rect.omni-chart__mark")).toHaveLength(6);
    expect(figure.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect([...figure.querySelectorAll(".omni-chart__legend li")].map((li) => li.textContent)).toEqual(["Online", "In store"]);
    const table = screen.getByRole("table", { name: "Sales by month" });
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["", "Jul", "Aug", "Sep"]);
    expect(within(table).getAllByRole("rowheader").map((c) => c.textContent)).toEqual(["Online", "In store"]);
  });

  it("writes a value, in the chart's format, when a bar is hovered or focused", () => {
    const h = renderOmni({ lines: bar });
    const marks = h.container.querySelectorAll("svg rect.omni-chart__mark");
    fireEvent.mouseEnter(marks[1]!);
    expect(h.container.querySelector(".omni-chart__readout")?.textContent).toBe("Aug · Online: $1,500.00");
    fireEvent.focus(marks[3]!);
    expect(h.container.querySelector(".omni-chart__readout")?.textContent).toBe("Jul · In store: $900.00");
  });

  it("grows as Series arrive: a pending one is a placeholder in the table and draws nothing yet", () => {
    const h = renderOmni({ lines: bar.slice(0, 2) });
    expect(h.container.querySelectorAll("svg rect.omni-chart__mark")).toHaveLength(3);
    expect(h.container.querySelector('[data-pending-id="store"]')).not.toBeNull();
    expect([...h.container.querySelectorAll(".omni-chart__legend li")].map((li) => li.textContent)).toEqual(["Online", "…"]);
    h.stream(bar[2]!);
    expect(h.container.querySelectorAll("svg rect.omni-chart__mark")).toHaveLength(6);
  });

  it("shows no legend for a single Series (the title names it)", () => {
    const h = renderOmni({ lines: ['root = BarChart("Visitors", ["W1", "W2"], [s])', 's = Series("Visitors", [3, 4])'] });
    expect(h.container.querySelector(".omni-chart__legend")).toBeNull();
  });
});

describe("LineChart", () => {
  it("draws a line per Series with a point per value, each Series with its own dash pattern", () => {
    const h = renderOmni({
      lines: ['root = LineChart("Visitors", ["W1", "W2", "W3"], [a, b])', 'a = Series("Web", [10, 12, 15])', 'b = Series("App", [5, 9, 7])'],
    });
    const lines = h.container.querySelectorAll("svg polyline");
    expect(lines).toHaveLength(2);
    expect(lines[0]!.getAttribute("stroke-dasharray")).toBeNull();
    expect(lines[1]!.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(h.container.querySelectorAll("svg circle.omni-chart__mark")).toHaveLength(6);
  });
});

describe("PieChart", () => {
  it("draws a slice per value, with each slice's share in the legend and a readout on hover", () => {
    const h = renderOmni({
      lines: ['root = PieChart("Where orders come from", [web, app, phone])', 'web = Slice("Website", 62)', 'app = Slice("App", 31)', 'phone = Slice("Phone", 7)'],
    });
    const marks = h.container.querySelectorAll("svg .omni-chart__mark");
    expect(marks).toHaveLength(3);
    expect([...h.container.querySelectorAll(".omni-chart__legend li")].map((li) => li.textContent)).toEqual(["Website62%", "App31%", "Phone7%"]);
    fireEvent.mouseEnter(marks[2]!);
    expect(h.container.querySelector(".omni-chart__readout")?.textContent).toBe("Phone: 7 (7%)");
    expect(within(screen.getByRole("table", { name: "Where orders come from" })).getAllByRole("rowheader")).toHaveLength(3);
  });
});

describe("chart helpers", () => {
  it("writes values as numbers, money or percentages (percent values are percentages already)", () => {
    expect(formatValue(1234.5, {}, "en-US")).toBe("1,234.5");
    expect(formatValue(1500, { format: "currency", currency: "EUR" }, "en-US")).toBe("€1,500.00");
    expect(formatValue(62, { format: "percent" }, "en-US")).toBe("62%");
  });

  it("chooses round axis ticks that include zero and the highest value", () => {
    expect(niceTicks(900, 1800)).toEqual([0, 500, 1000, 1500, 2000]);
    expect(niceTicks(-4, 12)[0]).toBeLessThanOrEqual(-4);
    expect(niceTicks(0, 0)).toEqual([0, 1]);
  });
});
