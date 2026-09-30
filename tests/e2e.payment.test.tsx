// @vitest-environment jsdom
// Task 5: stream the payment confirmation fixture through parser → store → OmniRenderer.
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createParser, type ParserEvent } from "../engine/parser";
import { TOOLS } from "./helpers";
import { chunkBytes, mockStream } from "./mockStream";
import { countingCatalog, renderOmni } from "./renderHelpers";

afterEach(cleanup);

const fixture = (name: string) => readFileSync(resolve("fixtures", name), "utf8");
const PAYMENT = fixture("payment-confirmation.omni");

function start(catalogMounts?: Map<string, number>) {
  const parser = createParser({ tools: TOOLS });
  const parserEvents: ParserEvent[] = [];
  parser.subscribe((e) => parserEvents.push(e));
  const h = renderOmni({ parser, ...(catalogMounts ? { catalog: countingCatalog(catalogMounts) } : {}) });
  const parserErrors = () => parserEvents.flatMap((e) => (e.type === "error" ? [e.issue.code] : []));
  const parserWarnings = () => parserEvents.flatMap((e) => (e.type === "warning" ? [e.issue.code] : []));
  return { ...h, parser, parserEvents, parserErrors, parserWarnings };
}

const arrived = (events: ParserEvent[], id: string) => events.some((e) => e.type === "node" && e.id === id);

describe("payment confirmation, streamed end to end", () => {
  it.each([1, 2, 3, 4, 5])("renders progressively and ends fully governed (chunk seed %i)", async (seed) => {
    const user = userEvent.setup();
    const mounts = new Map<string, number>();
    const h = start(mounts);
    let checkedMidway = false;

    for (const chunk of chunkBytes(PAYMENT, { seed, maxChunk: 9 })) {
      act(() => h.parser.write(chunk));

      // Midway: Confirm has arrived but its McpMutation line has not.
      if (!checkedMidway && arrived(h.parserEvents, "confirm") && !arrived(h.parserEvents, "confirmPay")) {
        checkedMidway = true;
        expect(h.container.querySelector('[data-pending-id="cancel"]')).toBeTruthy();
        expect((screen.getByRole("button", { name: "Pay now" }) as HTMLButtonElement).disabled).toBe(true);
      }
    }
    h.end();
    expect(checkedMidway).toBe(true);

    // End: everything arrived, nothing pending, no errors.
    expect(h.container.querySelector("[data-pending-id]")).toBeNull();
    expect(h.container.querySelector("[data-fallback-reason]")).toBeNull();
    expect(screen.getByText("Blue Bottle Café, Oakland (CA)")).toBeTruthy();
    expect(screen.getByText("$42.50")).toBeTruthy();
    expect(screen.getByText("Sep 30, 2026")).toBeTruthy();
    const pay = screen.getByRole("button", { name: "Pay now" });
    expect(pay.getAttribute("data-mcp-tool")).toBe("payments.confirm");
    expect(h.parserErrors()).toEqual([]);
    expect(h.parserWarnings()).toEqual([]);

    // Interaction: type a note (with commas and parentheses), pay, cancel.
    await user.type(screen.getByLabelText("Note for merchant (optional)"), "Table 4, thanks (again)");
    await user.click(pay);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.onMutation).toHaveBeenCalledTimes(1);
    expect(h.onMutation).toHaveBeenCalledWith({
      id: "confirmPay",
      target: "confirm",
      tool: "payments.confirm",
      params: { amount: 42.5, note: "Table 4, thanks (again)" },
    });
    expect(h.errors()).toEqual([]);

    // R3: no IR id was mounted twice while the stream arrived and the user interacted.
    for (const [id, count] of mounts) expect(count, id).toBe(1);
    expect([...mounts.keys()].sort()).toEqual(
      ["actions", "amount", "cancel", "confirm", "date", "merchant", "note", "root", "sep", "title"],
    );
  });

  it("gives the same result when streamed one byte at a time", () => {
    const h = start();
    for (const chunk of chunkBytes(PAYMENT, { minChunk: 1, maxChunk: 1 })) act(() => h.parser.write(chunk));
    h.end();
    expect(h.parserErrors()).toEqual([]);
    expect(screen.getByText("Blue Bottle Café, Oakland (CA)")).toBeTruthy();
  });

  it("works with a real async stream that has delays between chunks", async () => {
    const h = start();
    for await (const chunk of mockStream(PAYMENT, { seed: 42, maxChunk: 16, maxDelayMs: 3 })) {
      act(() => h.parser.write(chunk));
    }
    h.end();
    expect(h.parserErrors()).toEqual([]);
    expect(screen.getByRole("button", { name: "Pay now" }).getAttribute("data-mcp-tool")).toBe("payments.confirm");
  });
});

describe("payment confirmation variants (Task 5.4)", () => {
  function streamVariant(name: string) {
    const h = start();
    for (const chunk of chunkBytes(fixture(`variants/${name}`), { seed: 3 })) act(() => h.parser.write(chunk));
    h.end();
    return h;
  }

  it("missing McpMutation line → governance error, Confirm stays disabled", async () => {
    const h = streamVariant("missing-mutation.omni");
    expect(h.parserErrors()).toEqual(["ungoverned_mutation"]);
    const pay = screen.getByRole("button", { name: "Pay now" }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
    await userEvent.setup().click(pay);
    expect(h.onMutation).not.toHaveBeenCalled();
  });

  it("tool not in the registry → unknown_tool, Confirm stays disabled, onMutation never called", async () => {
    const h = streamVariant("unknown-tool.omni");
    expect(h.parserErrors()).toEqual(["unknown_tool", "ungoverned_mutation"]);
    const pay = screen.getByRole("button", { name: "Pay now" }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
    await userEvent.setup().click(pay);
    expect(h.onMutation).not.toHaveBeenCalled();
  });

  it("child that never arrives → dangling_ref, 'missing' fallback, rest of the card works", async () => {
    const h = streamVariant("dangling-child.omni");
    expect(h.parserErrors()).toEqual(["dangling_ref"]);
    expect(h.container.querySelector('[data-fallback-reason="missing"]')?.getAttribute("data-node-id")).toBe("receipt");
    await userEvent.setup().click(screen.getByRole("button", { name: "Pay now" }));
    expect(h.onMutation).toHaveBeenCalledWith(expect.objectContaining({ params: { amount: 42.5, note: "" } }));
  });

  it("unescaped Windows path → one warning, node rendered with the literal backslash", () => {
    const h = streamVariant("windows-path.omni");
    expect(h.parserErrors()).toEqual([]);
    expect(h.parserWarnings()).toEqual(["unknown_escape"]);
    expect(screen.getByText("Path: C:\\data")).toBeTruthy();
  });
});
