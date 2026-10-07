// The server's side of the transport (SPEC.md section 10), for the Express app and the in-browser API
// the hosted playground uses: framing, the terminal event, the version marker, the requested version,
// error bodies, and rate limits behind a proxy. The client's side is in transport.conformance.test.ts.
import { versionMarker } from "@omni-ir/core";
import { createInBrowserApi } from "../server/inBrowser";
import { ConfigError, loadConfig } from "../server/config";
import { MockModel } from "../server/models/mock";
import { FakeModel, readSse, startServer, textOf } from "./serverHelpers";

let server: Awaited<ReturnType<typeof startServer>> | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

const json = { method: "POST", headers: { "content-type": "application/json" } };
const prompt = JSON.stringify({ prompt: "a payment confirmation" });

/** Both implementations, as a fetch for a path such as "/api/generate?version=0.5". */
async function apis() {
  server = await startServer({ model: new MockModel({ speed: "instant", seed: 4 }) });
  const url = server.url;
  const inBrowser = createInBrowserApi({ model: new MockModel({ speed: "instant", seed: 4 }) });
  return [
    ["server", (path: string, init: RequestInit) => fetch(`${url}${path}`, init)],
    ["in-browser", (path: string, init: RequestInit) => inBrowser(path, init)],
  ] as const;
}

describe("the stream [10.4] [10.5] [10.13]", () => {
  it("is LF-framed events, each one event: line and one data: line, ending with exactly one terminal event", async () => {
    for (const [where, call] of await apis()) {
      const response = await call("/api/generate", { ...json, body: prompt });
      expect(response.status, where).toBe(200);
      expect(response.headers.get("content-type"), where).toMatch(/^text\/event-stream/);
      const { events, raw } = await readSse(response);
      expect(raw.includes("\r"), where).toBe(false);
      for (const block of raw.split("\n\n").filter((b) => b.trim() && !b.startsWith(":"))) {
        const lines = block.split("\n");
        expect(lines.filter((l) => l.startsWith("event: ")), `${where}: ${block}`).toHaveLength(1);
        expect(lines.filter((l) => l.startsWith("data: ")), `${where}: ${block}`).toHaveLength(1);
      }
      const terminal = events.filter((e) => e.event === "done" || e.event === "error");
      expect(terminal, where).toHaveLength(1);
      expect(events.at(-1), where).toBe(terminal[0]);
    }
  });

  it("starts with the version marker, written by the server, not the model", async () => {
    for (const [where, call] of await apis()) {
      const { events } = await readSse(await call("/api/generate", { ...json, body: prompt }));
      expect(textOf(events).startsWith("# omni-ir 0.5\n"), where).toBe(true); // the format's version, not the package's
      expect((events[0]!.data as { text: string }).text, where).toBe(`${versionMarker()}\n`);
    }
  });
});

describe("the requested version [10.1] [10.12] [10.2]", () => {
  it("streams to any client that can read its format: its own, old release numbers, newer formats, or none", async () => {
    for (const [where, call] of await apis()) {
      for (const path of ["/api/generate?version=0.5", "/api/generate?version=0.6", "/api/generate?version=0.7", "/api/generate?version=0.8", "/api/generate?version=99.0", "/api/generate"]) {
        const response = await call(path, { ...json, body: prompt });
        expect(response.status, `${where} ${path}`).toBe(200);
        await response.text();
      }
    }
  });

  it("refuses only a client that asks for an older format, before streaming, with unsupported_version", async () => {
    for (const [where, call] of await apis()) {
      for (const version of ["0.4", "0.1", "0.0"]) {
        const response = await call(`/api/generate?version=${version}`, { ...json, body: prompt });
        expect(response.status, `${where} ${version}`).toBe(400);
        expect(await response.json(), `${where} ${version}`).toEqual({
          error: { code: "unsupported_version", message: expect.stringContaining("0.5"), retryable: false },
        });
      }
    }
  });

  it("answers invalid_request for a version that isn't MAJOR.MINOR", async () => {
    for (const [where, call] of await apis()) {
      for (const version of ["abc", "0.5.0", "", "-1.0"]) {
        const response = await call(`/api/generate?version=${encodeURIComponent(version)}`, { ...json, body: prompt });
        expect(response.status, `${where} "${version}"`).toBe(400);
        expect(await response.json(), `${where} "${version}"`).toMatchObject({ error: { code: "invalid_request", retryable: false } });
      }
    }
  });

  it("doesn't call the model when it refuses", async () => {
    const model = new FakeModel(async () => ({ stopReason: "end_turn", model: "fake" }));
    server = await startServer({ model });
    const response = await fetch(`${server.url}/api/generate?version=0.4`, { ...json, body: prompt });
    expect(response.status).toBe(400);
    expect(model.calls).toBe(0);
  });
});

describe("rate limits behind a proxy [10.15]", () => {
  const limited = async (trustProxy: string | undefined, forwardedFor: string[]) => {
    const model = new FakeModel(async () => ({ stopReason: "end_turn", model: "fake" }));
    // Signed out (magic-link, no session), so only the per-address limit applies.
    server = await startServer({ model, config: { auth: "magic-link", rateLimitPerMinute: 1, trustProxy: loadConfig(trustProxy === undefined ? {} : { OMNI_TRUST_PROXY: trustProxy }).config.trustProxy } });
    const statuses: number[] = [];
    for (const address of forwardedFor) {
      const response = await fetch(`${server.url}/api/generate`, { ...json, headers: { ...json.headers, "x-forwarded-for": address }, body: prompt });
      statuses.push(response.status);
      await response.text();
    }
    return statuses;
  };

  it("ignores X-Forwarded-For by default, so a forged header can't dodge the limit", async () => {
    expect(await limited(undefined, ["203.0.113.1", "203.0.113.2"])).toEqual([200, 429]);
  });

  it("counts each client separately when the request came through a trusted proxy", async () => {
    // The test's requests come from 127.0.0.1, so trusting loopback makes this server "behind a proxy".
    expect(await limited("loopback", ["203.0.113.1", "203.0.113.2", "203.0.113.1"])).toEqual([200, 200, 429]);
    expect(await limited("1", ["203.0.113.1", "203.0.113.2"])).toEqual([200, 200]);
  });

  it("doesn't trust a proxy it wasn't told about", async () => {
    expect(await limited("10.0.0.0/8", ["203.0.113.1", "203.0.113.2"])).toEqual([200, 429]);
  });

  it("refuses OMNI_TRUST_PROXY=true, which would trust a header anyone can write", () => {
    expect(() => loadConfig({ OMNI_TRUST_PROXY: "true" })).toThrow(ConfigError);
    expect(loadConfig({}).config.trustProxy).toBe(false);
    expect(loadConfig({ OMNI_TRUST_PROXY: "false" }).config.trustProxy).toBe(false);
    expect(loadConfig({ OMNI_TRUST_PROXY: "2" }).config.trustProxy).toBe(2);
    expect(loadConfig({ OMNI_TRUST_PROXY: "loopback, 10.0.0.0/8" }).config.trustProxy).toEqual(["loopback", "10.0.0.0/8"]);
  });
});
