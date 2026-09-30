// Task A: the real Vite dev server serves the page and the Omni-IR API from one origin.
import { createServer, type ViteDevServer } from "vite";

let vite: ViteDevServer;
let base: string;

beforeAll(async () => {
  vite = await createServer({
    configFile: "playground/vite.config.ts",
    server: { port: 0, host: "127.0.0.1" },
    logLevel: "silent",
    clearScreen: false,
  });
  await vite.listen();
  const address = vite.httpServer!.address() as { port: number };
  base = `http://127.0.0.1:${address.port}`;
}, 30_000);

afterAll(async () => {
  await vite?.close();
});

describe("npm run playground (dev server)", () => {
  it("serves the playground page", async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain("Omni-IR Playground");
  });

  it("serves the API in-process with the free mock model", async () => {
    const health = await (await fetch(`${base}/api/health`)).json();
    expect(health).toEqual({ ok: true, model: "mock" });
  });

  it("streams /api/generate from the same origin", async () => {
    const response = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "demo: windows path" }),
    });
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/);
    const body = await response.text();
    expect(body).toContain("event: done");
  }, 20_000);

  it("leaves non-API paths to Vite", async () => {
    const response = await fetch(`${base}/main.tsx`);
    expect(response.status).toBe(200);
  });
});
