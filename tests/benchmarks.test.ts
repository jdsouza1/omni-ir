// Step 9: the format comparison (PLAN-COMPARISON.md). The converters must be faithful, and the
// committed outputs and results must be what `npm run bench` produces.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { createParser, type Issue } from "@omni-ir/core";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { run } from "../benchmarks/run";
import { A2UI_BATCHED, A2UI_STREAMED, JSON_RENDER, OMNI, OPENUI, jsonRenderOpenUIStyle } from "../benchmarks/src/emit";
import { parseOmni, parseOpenUILang } from "../benchmarks/src/parse";
import { BENCH_DIR, loadScreens } from "../benchmarks/src/screens";
import { mutationFor, nodes, resolveValues, type Screen } from "../benchmarks/src/tree";

const sources = loadScreens();
const bench = (rel: string) => readFileSync(join(BENCH_DIR, rel), "utf8");

/** What a screen says, independent of how it was written: components, state and governed actions. */
function canonical(screen: Screen) {
  return {
    nodes: nodes(screen)
      .map((n) => ({
        id: n.id,
        type: n.type,
        // A governed Button's action name is Omni-IR's own; other formats name the tool instead.
        props: n.props.filter(([k]) => !(k === "action" && mutationFor(screen, n.id))).map(([k, v]) => [k, resolveValues(screen, v)]),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    state: screen.stmts.flatMap((s) => (s.kind === "state" ? [[s.key, s.value]] : [])),
    mutations: screen.stmts.flatMap((s) => (s.kind === "mutation" ? [[s.target, s.tool, s.params]] : [])),
  };
}

function omniIssues(text: string): Issue[] {
  const parser = createParser({ tools: TOOLS, assets: ASSETS });
  const issues: Issue[] = [];
  parser.subscribe((e) => {
    if (e.type === "error") issues.push(e.issue);
  });
  parser.write(text);
  return [...issues, ...parser.end()];
}

describe("benchmarks: outputs", () => {
  it("are committed and up to date (npm run bench)", () => {
    const { files } = run();
    for (const [rel, text] of files) expect(bench(rel), rel).toBe(text);
  }, 60_000);
});

describe("benchmarks: sources", () => {
  it.each(sources.filter((s) => s.screen.set === "omni").map((s) => [s.screen.name, s.original]))(
    "the model-check reply %s is valid Omni-IR",
    (_, text) => {
      expect(omniIssues(text)).toEqual([]);
    },
  );

  it("are the replies recorded in docs/model-check-2026-10-01.md", () => {
    const doc = readFileSync(join(BENCH_DIR, "../docs/model-check-2026-10-01.md"), "utf8");
    for (const { screen, original } of sources.filter((s) => s.screen.set === "omni")) {
      expect(doc, screen.name).toContain(`## ${screen.name}\n${original}`);
    }
  });
});

describe("benchmarks: converters", () => {
  it.each(sources.map((s) => [s.screen.name, s.screen]))("Omni-IR output of %s reads back as the same screen", (_, screen) => {
    const text = OMNI.emit(screen).text;
    expect(canonical(parseOmni(screen.name, screen.set, screen.catalog, text))).toEqual(canonical(screen));
    if (screen.set === "omni") expect(omniIssues(text)).toEqual([]);
  });

  it.each(sources.map((s) => [s.screen.name, s.screen]))("OpenUI Lang output of %s reads back as the same screen", (_, screen) => {
    const text = OPENUI.emit(screen).text;
    expect(canonical(parseOpenUILang(screen.name, screen.set, screen.catalog, text))).toEqual(canonical(screen));
  });

  it.each(sources.filter((s) => s.screen.set === "openui").map((s) => [s.screen.name, s.screen]))(
    "reads OpenUI's %s exactly as OpenUI's own converter did (json-render file byte for byte)",
    (name, screen) => {
      expect(jsonRenderOpenUIStyle(screen)).toBe(bench(`sources/openui/samples/${name}.vercel.jsonl`));
    },
  );

  it.each(sources.map((s) => [s.screen.name, s.screen]))("json-render output of %s builds the whole screen", (_, screen) => {
    const spec = { root: "", elements: {} as Record<string, { type: string; children: string[] }>, state: {} as Record<string, unknown> };
    for (const line of JSON_RENDER.emit(screen).text.trim().split("\n")) {
      const op = JSON.parse(line) as { op: string; path: string; value: never };
      expect(op.op).toBe("add");
      const [, top, key] = op.path.split("/");
      if (top === "root") spec.root = op.value;
      else if (top === "elements") spec.elements[key as string] = op.value;
      else if (top === "state") spec.state[key as string] = op.value;
      else throw new Error(op.path);
    }
    expect(spec.root).toBe("root");
    expect(Object.keys(spec.elements).sort()).toEqual(nodes(screen).map((n) => n.id).sort());
    for (const el of Object.values(spec.elements)) for (const c of el.children) expect(spec.elements[c], c).toBeDefined();
    expect(Object.keys(spec.state)).toEqual(screen.stmts.flatMap((s) => (s.kind === "state" ? [s.key.slice(1)] : [])));
  });
});

describe("benchmarks: A2UI output", () => {
  // A2UI's published message schema (v0.9.1). Components carry the screen's own catalog, so the
  // catalog stub checks only what every A2UI component must have, plus A2UI's own Action shape.
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const common = JSON.parse(bench("sources/a2ui/common_types.json"));
  ajv.addSchema(common);
  ajv.addSchema({
    $id: "https://a2ui.org/specification/v0_9/catalog.json",
    $defs: {
      anyComponent: {
        allOf: [{ $ref: "common_types.json#/$defs/ComponentCommon" }],
        properties: { component: { type: "string" }, action: { $ref: "common_types.json#/$defs/Action" } },
        required: ["id", "component"],
      },
      anyFunction: {},
      theme: { type: "object" },
    },
  });
  const validate = ajv.compile(JSON.parse(bench("sources/a2ui/server_to_client.json")));

  it.each(sources.map((s) => [s.screen.name, s.screen]))("for %s follows A2UI's message schema, batched and streamed", (_, screen) => {
    for (const format of [A2UI_BATCHED, A2UI_STREAMED]) {
      const messages = format.emit(screen).text.trim().split("\n").map((l) => JSON.parse(l));
      for (const m of messages) expect(validate(m) ? [] : validate.errors).toEqual([]);
      const components = messages.flatMap((m) => m.updateComponents?.components ?? []) as { id: string; children?: string[] }[];
      expect(components.map((c) => c.id).sort()).toEqual(nodes(screen).map((n) => n.id).sort());
      expect(components.some((c) => c.id === "root")).toBe(true);
    }
  });
});
