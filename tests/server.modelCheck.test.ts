// Step 17 (PLAN-MODELCHECK.md, B): the model check in the reference server. Scripted models only.
import { afterEach, describe, expect, it } from "vitest";
import type { Challenge } from "../app/challenges";
import type { ModelGate } from "../server/modelCheck";
import { MockModel } from "../server/models/mock";
import type { GenerateOptions, GenerateResult, Model } from "../server/models/types";
import { readSse, startServer } from "./serverHelpers";

const GOOD = `root = Card([t, n])
t = Heading("Hello")
n = Text("Plain text only.")
`;
const POOL: Challenge[] = [
  ...["b1", "b2", "b3", "b4"].map((id): Challenge => ({ id, kind: "build", text: `challenge ${id}`, expect: { components: ["Heading", "Text"] } })),
  ...["p1", "p2"].map((id): Challenge => ({ id, kind: "probe", text: `challenge ${id}`, expect: { minComponents: 2 } })),
];

/** Answers challenge requests well (or badly) and people's requests with `live`. */
class TwoFacedModel implements Model {
  readonly kind = "mock" as const;
  readonly setup = { id: "two-faced", systemPrompt: "test prompt" };
  challenges = 0;
  passChallenges = true;
  live = GOOD;
  /** Challenge replies wait for this, so a test can see the server while the check runs. */
  hold: Promise<void> = Promise.resolve();
  async generate(prompt: string, { onText }: GenerateOptions): Promise<GenerateResult> {
    if (prompt.startsWith("challenge ")) {
      this.challenges++;
      await this.hold;
      onText(this.passChallenges ? GOOD : "Sure, here you go!");
    } else onText(this.live);
    return { stopReason: "end_turn", model: "two-faced" };
  }
}

let server: Awaited<ReturnType<typeof startServer>> | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const gateOf = () => server!.app.locals.modelCheck as ModelGate;
const health = async () => (await (await fetch(`${server!.url}/api/health`)).json()) as Record<string, unknown>;

describe("the model check in the server", () => {
  it("off by default with the mock model: serves at once, and health says so", async () => {
    server = await startServer({ model: new MockModel({ speed: "instant" }) });
    expect((await server.generate({ prompt: "contact support" })).status).toBe(200);
    expect(await health()).toMatchObject({ modelCheck: { mode: "off" } });
  });

  it("enforce: answers 503 model_unverified with Retry-After until the setup passes [10.23]", async () => {
    const model = new TwoFacedModel();
    let release = () => {};
    model.hold = new Promise((resolve) => (release = resolve));
    server = await startServer({ model, config: { modelCheck: "enforce" }, modelCheck: { pool: POOL } });
    const refused = await server.generate({ prompt: "a screen" });
    expect(refused.status).toBe(503);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await refused.json()).toEqual({ error: { code: "model_unverified", message: expect.any(String), retryable: true } });
    expect(server.logs).toContainEqual(expect.objectContaining({ event: "generate", outcome: "model_unverified" }));
    expect(await health()).toMatchObject({ modelCheck: { mode: "enforce", state: "checking" } });

    release();
    await gateOf().settled();
    expect(model.challenges).toBe(6);
    const served = await server.generate({ prompt: "a screen" });
    expect(served.status).toBe(200);
    expect((await readSse(served)).events.at(-1)?.event).toBe("done");
    expect(await health()).toMatchObject({ modelCheck: { mode: "enforce", state: "passed" } });
  });

  it("enforce: the AG-UI route is refused the same way", async () => {
    const model = new TwoFacedModel();
    model.passChallenges = false;
    server = await startServer({ model, config: { modelCheck: "enforce" }, modelCheck: { pool: POOL } });
    await gateOf().settled();
    const response = await fetch(`${server.url}/api/ag-ui`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: "t", runId: "r", messages: [{ id: "m", role: "user", content: "a screen" }] }),
    });
    expect(response.status).toBe(503);
    expect(await health()).toMatchObject({ modelCheck: { state: "failed" } });
  });

  it("challenges with the same model the server uses, tells the setup apart by its fingerprint, and never stores a reply [10.21] [10.22]", async () => {
    const model = new TwoFacedModel();
    server = await startServer({ model, config: { modelCheck: "warn" }, modelCheck: { pool: POOL } });
    await gateOf().settled();
    const status = (await health()).modelCheck as Record<string, unknown>;
    expect(status).toMatchObject({ mode: "warn", state: "passed", fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const check = server.logs.find((e) => e.event === "model_check");
    expect(check).toMatchObject({ passed: true, reason: "start", total: 6 });
    expect(JSON.stringify(check)).not.toContain("Heading(");
  });

  it("live replies with errors trigger a new challenge [10.24]", async () => {
    const model = new TwoFacedModel();
    server = await startServer({ model, config: { modelCheck: "enforce", rateLimitPerMinute: 100 }, modelCheck: { pool: POOL } });
    await gateOf().settled();
    model.live = 'root = Carousel(["a"])\n'; // unknown_component in every live reply
    model.passChallenges = false;
    for (let i = 0; i < 10; i++) await readSse(await server.generate({ prompt: "a screen" }));
    await gateOf().settled();
    expect(model.challenges).toBe(12);
    expect(await health()).toMatchObject({ modelCheck: { state: "failed" } });
    expect((await server.generate({ prompt: "a screen" })).status).toBe(503);
  });
});
