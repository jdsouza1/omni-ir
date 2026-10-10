// Updates (SPEC.md [10.29]-[10.34]): the parts the conformance cases (conformance/cases/live.json)
// can't express: the API, identity of unchanged components, events, and random updates.
import fc from "fast-check";
import { z } from "zod";
import { createParser, ISSUE_CODES, MAX_UPDATE_LINES, ROOT_ID, type ParserEvent } from "@omni-ir/core";
import { fixtureTexts, FUZZ_ASSETS, FUZZ_COMPONENTS, FUZZ_PICTURES, FUZZ_TOOLS, screenWithUpdates } from "../fuzz/arbitraries";
import { parseWithUpdates } from "./canonical";

const ORDER = [
  'root = Card([status, eta, ret], title="Order 1042")',
  'status = Badge("Shipped")',
  '$eta = "Friday"',
  "eta = Text($eta)",
  'ret = Button("Request a return", action="requestReturn")',
  'm = McpMutation(ret, tool="orders.requestReturn", params={order: "1042"})',
].join("\n");

function order() {
  const parser = createParser({ tools: { "orders.requestReturn": z.any() } });
  parser.write(ORDER);
  parser.end();
  return parser;
}

describe("updates [10.29]", () => {
  it("refuse to run before the stream has ended", () => {
    const parser = createParser({ tools: {} });
    parser.write("root = Divider()\n");
    expect(() => parser.update('root = Text("x")')).toThrow(/before end/);
  });

  it("keep every component the update didn't assign as the same object, so renderers skip it [8.8]", () => {
    const parser = order();
    const before = parser.getSnapshot();
    const [root, eta, ret, status] = ["root", "eta", "ret", "status"].map((id) => before.nodes.get(id));
    expect(parser.update('status = Badge("Delivered")\n')).toEqual({ applied: true, issues: [] });
    const after = parser.getSnapshot();
    expect(after).not.toBe(before);
    expect(after.nodes.get("root")).toBe(root);
    expect(after.nodes.get("eta")).toBe(eta);
    expect(after.nodes.get("ret")).toBe(ret);
    expect(after.nodes.get("status")).not.toBe(status);
    expect(after.lastUpdate).toEqual({ count: 1, assigned: ["status"] });
  });

  it("a rejected update leaves the very same snapshot, and reports through the parser's events", () => {
    const parser = order();
    const events: ParserEvent[] = [];
    parser.subscribe((e) => events.push(e));
    const before = parser.getSnapshot();
    const result = parser.update('$eta = "Today"\nstatus = Nope()\n');
    expect(result.applied).toBe(false);
    expect(result.issues.map((i) => [i.line, i.code])).toEqual([[2, "unknown_component"]]);
    expect(parser.getSnapshot()).toBe(before);
    expect(events).toEqual([{ type: "update", applied: false, issues: result.issues }]);
  });

  it("a state change gives a new state object; a removal drops the Button's McpMutation", () => {
    const parser = order();
    const state = parser.getSnapshot().state;
    parser.update('$eta = "Today"\nroot = Card([status, eta], title="Order 1042")\n');
    const doc = parser.getSnapshot();
    expect(doc.state).not.toBe(state);
    expect(doc.state.$eta).toBe("Today");
    expect(doc.nodes.has("ret")).toBe(false);
    expect(doc.mutations.size).toBe(0);
    expect(doc.lastUpdate?.count).toBe(1);
  });

  it("an McpMutation moved to another Button governs only the new one", () => {
    const parser = order();
    const result = parser.update(
      [
        'root = Card([status, eta, ret, again], title="Order 1042")',
        'ret = Button("Request a return")',
        'again = Button("Return again", action="requestReturn")',
        'm = McpMutation(again, tool="orders.requestReturn", params={order: "1042"})',
      ].join("\n"),
    );
    expect(result).toEqual({ applied: true, issues: [] });
    expect([...parser.getSnapshot().mutations.keys()]).toEqual(["again"]);
  });

  it(`refuses more than ${MAX_UPDATE_LINES} lines before reading any`, () => {
    const parser = order();
    const result = parser.update("# x\n".repeat(MAX_UPDATE_LINES) + "status = Badge(\n");
    expect(result.issues.map((i) => i.code)).toEqual(["update_too_large"]);
  });
});

describe("fuzz: random updates [10.33]", () => {
  const registry = { tools: FUZZ_TOOLS, assets: FUZZ_ASSETS, components: FUZZ_COMPONENTS, pictures: FUZZ_PICTURES };
  const numRuns = Number(process.env.FUZZ_RUNS ?? 300);
  const seed = Number(process.env.FUZZ_SEED ?? 20261010);

  it("never throw; a rejected update changes nothing; an applied one leaves only what root reaches", () => {
    let applied = 0;
    let rejected = 0;
    fc.assert(
      fc.property(screenWithUpdates(fixtureTexts()), ({ screen, updates }) => {
        for (let n = 0; n < updates.length; n++) {
          const before = parseWithUpdates([screen], updates.slice(0, n), registry);
          const after = parseWithUpdates([screen], updates.slice(0, n + 1), registry);
          const result = after.updates[n]!;
          for (const issue of result.issues) expect(Object.hasOwn(ISSUE_CODES, issue.code), issue.code).toBe(true);
          if (!result.applied) {
            rejected++;
            expect(after.screen).toEqual(before.screen);
            expect(result.issues.length).toBeGreaterThan(0);
            continue;
          }
          applied++;
          const nodes = after.screen.nodes;
          const reach = new Set<string>();
          const visit = (id: string) => {
            if (reach.has(id) || !(id in nodes)) return;
            reach.add(id);
            for (const c of nodes[id]!.children) visit(c);
          };
          visit(ROOT_ID);
          expect(Object.keys(nodes).sort()).toEqual([...reach].sort());
          for (const target of Object.keys(after.screen.mutations)) expect(reach.has(target)).toBe(true);
        }
      }),
      { numRuns, seed, endOnFailure: false },
    );
    // Both outcomes are exercised, or the generator is broken.
    expect(applied).toBeGreaterThan(numRuns / 4);
    expect(rejected).toBeGreaterThan(numRuns / 4);
  }, 120_000);
});
