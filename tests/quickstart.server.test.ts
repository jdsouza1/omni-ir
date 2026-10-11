// The developer guide's server code, steps 4 and 5, run as a reader would paste it, with a fake
// Anthropic client: nothing is sent to a model and nothing is billed (PLAN-QUICKSTART A.5).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { writeApp } from "./quickstartGuide";

const sdk = vi.hoisted(() => ({ calls: [] as unknown[], reply: [] as string[] }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      stream(body: unknown) {
        sdk.calls.push(body);
        let onText: (text: string) => void = () => {};
        return {
          on(event: string, listener: (text: string) => void) {
            if (event === "text") onText = listener;
            return this;
          },
          async finalMessage() {
            for (const text of sdk.reply) onText(text);
            return {};
          },
        };
      },
    };
  },
}));

let server: Server | undefined;
afterEach(() => {
  server?.close();
  vi.restoreAllMocks();
});

async function serve(app: express.Express): Promise<string> {
  server = createServer(app);
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("the developer guide's server", () => {
  it("step 4: sends the generated instructions and the request, and streams the reply as text", async () => {
    vi.spyOn(express.application, "listen").mockImplementation(function (this: unknown) {
      return this as never;
    });
    const dir = writeApp("server4", 4);
    const { app } = (await import(/* @vite-ignore */ `${dir}/server.ts`)) as { app: express.Express };
    sdk.reply = ["root = Card([title])\n", 'title = Heading("Order #A1B2-7731")\n'];
    const base = await serve(app);
    const response = await fetch(`${base}/api/screen`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: "Where is my order?" }) });
    expect(await response.text()).toBe('root = Card([title])\ntitle = Heading("Order #A1B2-7731")\n');
    const call = sdk.calls.at(-1) as { system: string; messages: { content: string }[] };
    expect(call.system).toContain("You write user interfaces in Omni-IR");
    expect(call.system).toContain("- orders.requestReturn: params {orderId: text}");
    expect(call.messages[0]!.content).toBe("Where is my order?");
  });

  it("step 5: runs an allowed action with valid params, and refuses anything else", async () => {
    const dir = writeApp("server5", 5);
    const { addActions } = (await import(/* @vite-ignore */ `${dir}/actions.ts`)) as { addActions: (app: express.Express) => void };
    const app = express();
    app.use(express.json());
    addActions(app);
    const base = await serve(app);
    const post = (body: unknown) => fetch(`${base}/api/action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    const ok = await post({ tool: "orders.requestReturn", params: { orderId: "A1B2-7731" } });
    expect(await ok.json()).toEqual({ update: 'status = Badge("Return requested")\n' });
    expect((await post({ tool: "orders.delete", params: {} })).status).toBe(400);
    expect((await post({ tool: "orders.requestReturn", params: { orderId: 42 } })).status).toBe(400);
  });
});
