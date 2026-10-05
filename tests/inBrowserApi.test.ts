// The hosted playground has no server: the same API answers inside the browser (Step 12, B).
// Every request here is sent both to the Express app and to the in-browser API, and the answers
// must match, so the hosted playground behaves exactly like `npm run playground`.
import { readFileSync } from "node:fs";
import { createParser } from "@omni-ir/core";
import { generate } from "@omni-ir/react";
import { ASSETS } from "../app/assets";
import { TOOLS } from "../app/tools";
import { createInBrowserApi } from "../server/inBrowser";
import { FixtureModel } from "../server/models/fixtureModel";
import { MockModel } from "../server/models/mock";
import { readSse, startServer, textOf } from "./serverHelpers";

const fixture = (id: string) => readFileSync(`fixtures/${id}.omni`, "utf8");
const model = () => new MockModel({ speed: "instant", seed: 7 });
const browserModel = () => new FixtureModel({ speed: "instant", seed: 7, read: fixture });

let server: Awaited<ReturnType<typeof startServer>> | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

const post = (path: string, body: unknown): [string, RequestInit] => [
  path,
  { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) },
];

/** The same request to both, returning [express, inBrowser] responses. */
async function both(path: string, init?: RequestInit): Promise<[Response, Response]> {
  server ??= await startServer({ model: model() });
  const api = createInBrowserApi({ model: browserModel() });
  return Promise.all([fetch(`${server.url}${path}`, init), api(path, init)]);
}

describe("FixtureModel (the mock model without the file system)", () => {
  it("routes prompts exactly like MockModel", () => {
    const prompts = ["a payment confirmation", "contact support", "sales chart", "book a stay", "demo: cut off", "demo: nonsense", "hello"];
    for (const p of prompts) expect(browserModel().route(p), p).toBe(model().route(p));
  });

  it("imports nothing from Node, so it can run in a browser", () => {
    const source = readFileSync("server/models/fixtureModel.ts", "utf8") + readFileSync("server/inBrowser.ts", "utf8");
    expect(source).not.toMatch(/from "node:|require\(/);
  });
});

describe("in-browser API answers like the server", () => {
  it("GET /api/health reports the mock model", async () => {
    const [a, b] = await both("/api/health");
    expect(b.status).toBe(a.status);
    expect(await b.json()).toEqual(await a.json());
  });

  it.each(["contact support", "sales chart", "demo: unknown tool", "demo: cut off", "demo: model error"])(
    "POST /api/generate %s streams the same events",
    async (prompt) => {
      const [a, b] = await both(...post("/api/generate", { prompt }));
      expect(b.status).toBe(200);
      expect(b.headers.get("content-type")).toBe(a.headers.get("content-type"));
      const [ea, eb] = [(await readSse(a)).events, (await readSse(b)).events];
      expect(textOf(eb)).toBe(textOf(ea));
      const last = (events: typeof ea) => {
        const { event, data } = events.at(-1)!;
        const { ms: _ms, ...rest } = data as Record<string, unknown>;
        return { event, rest };
      };
      expect(last(eb)).toEqual(last(ea));
    },
  );

  it.each([
    ["an empty prompt", { prompt: "  " }],
    ["an unknown field", { prompt: "hi", extra: 1 }],
    ["not JSON", "{oops"],
  ])("POST /api/generate rejects %s the same way", async (_name, body) => {
    const [a, b] = await both(...post("/api/generate", body));
    expect(b.status).toBe(a.status);
    expect(((await b.json()) as { error: { code: string } }).error.code).toBe(((await a.json()) as { error: { code: string } }).error.code);
  });

  it.each([
    ["a valid action", { tool: "payments.confirm", params: { amount: 42.5, note: "Table 4" } }],
    ["an unknown tool", { tool: "accounts.delete", params: {} }],
    ["params the tool rejects", { tool: "payments.confirm", params: { amount: -1 } }],
    ["a reserved key", JSON.stringify({ tool: "payments.confirm", params: JSON.parse('{"amount": 1, "__proto__": {"x": 1}}') })],
    ["a malformed body", { tool: "payments.confirm" }],
  ])("POST /api/mutate handles %s the same way", async (_name, body) => {
    const [a, b] = await both(...post("/api/mutate", body));
    expect(b.status).toBe(a.status);
    const [ja, jb] = [(await a.json()) as Record<string, any>, (await b.json()) as Record<string, any>];
    if (a.status === 200) {
      expect(jb.ok).toBe(true);
      expect(Object.keys(jb.result).sort()).toEqual(Object.keys(ja.result).sort());
    } else {
      expect(jb.error.code).toBe(ja.error.code);
    }
  });

  it("unknown paths are 404 not_found", async () => {
    const [a, b] = await both("/api/nothing");
    expect(b.status).toBe(a.status);
    expect(((await b.json()) as { error: { code: string } }).error.code).toBe("not_found");
  });
});

describe("the playground's client against the in-browser API", () => {
  it("streams a screen into a parser, with no network", async () => {
    const api = createInBrowserApi({ model: browserModel() });
    const parser = createParser({ tools: TOOLS, assets: ASSETS });
    const problems: string[] = [];
    parser.subscribe((e) => (e.type === "error" || e.type === "warning") && problems.push(e.issue.code));
    const outcome = await generate("contact support", { parser, signal: new AbortController().signal, fetch: api });
    expect(outcome.status).toBe("done");
    expect(parser.getSnapshot().nodes.size).toBeGreaterThan(3);
    expect(problems).toEqual([]);
  });

  it("stops when cancelled", async () => {
    const api = createInBrowserApi({ model: new FixtureModel({ speed: "realistic", read: fixture }) });
    const parser = createParser({ tools: TOOLS, assets: ASSETS });
    const controller = new AbortController();
    const pending = generate("contact support", { parser, signal: controller.signal, fetch: api });
    setTimeout(() => controller.abort(), 50);
    expect((await pending).status).toBe("aborted");
  });
});
