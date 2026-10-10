// Runs the transport conformance cases (conformance/transport/*.json, SPEC.md section 10) against the
// browser client, generate(), with a fake fetch that answers each case's response in chunks of bytes.
import { readFileSync, readdirSync } from "node:fs";
import type { OmniParser } from "@omni-ir/core";
import { generate, type GenerateOutcome } from "@omni-ir/react";
import { renderTransportFiles, TRANSPORT_CASES, type TransportCase } from "../conformance/transport";
import { CASES } from "../conformance/build";

const dir = "conformance/transport";
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const cases: TransportCase[] = files.flatMap((f) => (JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as { cases: TransportCase[] }).cases);

/** A stand-in parser that records what the client writes. */
function recorder() {
  const state = { written: "", ended: false };
  const decoder = new TextDecoder();
  const parser = {
    write: (chunk: string | Uint8Array) => void (state.written += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true })),
    end: () => {
      state.ended = true;
      return [];
    },
  } as unknown as OmniParser;
  return { parser, state };
}

/** A fetch that answers with the case's response, its body split into reads of `size` bytes (null: one read). */
type Sent = { url: string; init: RequestInit | undefined };

function fakeFetch(c: TransportCase, size: number | null, requests: Sent[] = []): typeof fetch {
  const body = new TextEncoder().encode(typeof c.response.body === "string" ? c.response.body : c.response.body.join(""));
  return async (input, init) => {
    requests.push({ url: String(input), init });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const step = size ?? Math.max(body.length, 1);
        for (let at = 0; at < body.length; at += step) controller.enqueue(body.slice(at, at + step));
        controller.close();
      },
    });
    const ok = c.response.status >= 200 && c.response.status < 300;
    return new Response(stream, { status: c.response.status, headers: { "content-type": ok ? "text/event-stream" : "application/json" } });
  };
}

async function run(c: TransportCase, size: number | null) {
  const { parser, state } = recorder();
  const outcome = await generate("a screen", { parser, fetch: fakeFetch(c, size) });
  return { ...state, outcome };
}

function matches(outcome: GenerateOutcome, expected: TransportCase["expect"]["outcome"]) {
  expect(outcome.status).toBe(expected.status);
  for (const [key, value] of Object.entries(expected)) expect((outcome as Record<string, unknown>)[key], key).toEqual(value);
}

describe("transport conformance suite", () => {
  it("JSON files match conformance/transport.ts (run npm run conformance:build if this fails)", () => {
    const expected = renderTransportFiles();
    expect(files.sort()).toEqual(Object.keys(expected).sort());
    for (const [name, text] of Object.entries(expected)) expect(readFileSync(`${dir}/${name}`, "utf8")).toBe(text);
  });

  it("has unique case ids", () => {
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe.each(cases.map((c) => [c.id, c] as const))("%s", (_, c) => {
    it("gives the expected result however the body is split into reads", async () => {
      for (const size of [null, 1, 5, 13]) {
        const result = await run(c, size);
        expect(result.written, `reads of ${size ?? "all"} bytes`).toBe(c.expect.written);
        expect(result.ended, `reads of ${size ?? "all"} bytes`).toBe(c.expect.ended);
        matches(result.outcome, c.expect.outcome);
      }
    });
  });

  it("covers every rule in SPEC.md section 10 (by a case here, or by a test that cites it), and cites only rules that exist", () => {
    const spec = readFileSync("SPEC.md", "utf8");
    const body = spec.slice(spec.indexOf("## 10. Transport"), spec.indexOf("## 11. Security considerations"));
    const specRules = new Set([...body.matchAll(/\*\*\[(10\.\d+)\]\*\*/g)].map((m) => m[1]!));
    const tests = readdirSync("tests")
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => readFileSync(`tests/${f}`, "utf8"))
      .join("\n");
    const citedByTests = new Set([...tests.matchAll(/\[(10\.\d+)\]/g)].map((m) => m[1]!));
    // WebSockets are specified, not built (PLAN-TRANSPORT.md, decision 4): no endpoint to test yet.
    const specOnly = new Set(["10.16", "10.17"]);
    // The update rules ([10.29]-[10.34]) are parser rules, covered by conformance/cases/live.json.
    const liveCases = CASES.live!.flatMap((c) => c.rules);
    const covered = new Set([...TRANSPORT_CASES.flatMap((c) => c.rules), ...liveCases, ...citedByTests, ...specOnly]);
    expect([...specRules].filter((r) => !covered.has(r)), "rules without a case or test").toEqual([]);
    const cited = TRANSPORT_CASES.flatMap((c) => c.rules).filter((r) => r.startsWith("10."));
    expect(cited.filter((r) => !specRules.has(r)), "cases citing unknown rules").toEqual([]);
    expect(specRules.size).toBe(40);
  });

  it("asks for a screen as [10.1] says: POST, JSON body, event-stream, and the version in the query", async () => {
    const requests: Sent[] = [];
    const { parser } = recorder();
    await generate("a screen", { parser, fetch: fakeFetch(TRANSPORT_CASES[0]!, null, requests) });
    const [{ url, init }] = requests as [Sent];
    const headers = new Headers(init?.headers);
    expect(init?.method).toBe("POST");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("accept")).toBe("text/event-stream");
    expect(JSON.parse(String(init?.body))).toEqual({ prompt: "a screen" });
    expect(new URL(url, "http://x").searchParams.get("version")).toMatch(/^\d+\.\d+$/);
  });
});
