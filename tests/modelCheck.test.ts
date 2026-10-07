// Step 17 (PLAN-MODELCHECK.md): the model proficiency check. A challenge drawn at random from the pool,
// each reply scored by the real parser; a pass clears one setup. Everything here uses scripted fake
// models: no paid API.
import { describe, expect, it } from "vitest";
import { COMPONENT_TYPES } from "@omni-ir/core";
import { ASSETS } from "../app/assets";
import { CHALLENGES, type Challenge } from "../app/challenges";
import { TOOLS } from "../app/tools";
import { createMemoryStore } from "../server/backend/memoryStore";
import { createModelGate, drawChallenge, passes, runChallenge, scoreReply, setupFingerprint, CHALLENGE_SIZE } from "../server/modelCheck";
import { ModelError, type GenerateOptions, type GenerateResult, type Model } from "../server/models/types";

const registries = { tools: TOOLS, assets: ASSETS };

/** A model that answers each challenge request from a script, keyed by the request's text. */
class ScriptedModel implements Model {
  readonly kind = "mock" as const;
  readonly prompts: string[] = [];
  constructor(private readonly answer: (prompt: string) => string | Error) {}
  async generate(prompt: string, { onText }: GenerateOptions): Promise<GenerateResult> {
    this.prompts.push(prompt);
    const reply = this.answer(prompt);
    if (reply instanceof Error) throw reply;
    for (const piece of reply.match(/[\s\S]{1,7}/g) ?? []) onText(piece);
    return { stopReason: "end_turn", model: "scripted" };
  }
}

const GOOD_SIGN_IN = `root = Card([email, send])
$email = ""
email = Input($email, label="Email")
send = Button("Email me a link", action="go")
go = McpMutation(send, tool="auth.sendMagicLink", params={email: $email})
`;
const GOOD_TABLE = `root = Table(["Order", "Status"], [r1])
r1 = TableRow(["A1", "Shipped"])
`;
const GOOD_TEXT = `root = Card([t, n])
t = Heading("Hello")
n = Text("Plain text only.")
`;

/** A small pool for tests: four build requests and two probes, each with a good reply. */
const POOL: Challenge[] = [
  { id: "b1", kind: "build", text: "build one", expect: { components: ["Input", "Button"], tools: ["auth.sendMagicLink"] } },
  { id: "b2", kind: "build", text: "build two", expect: { components: ["Table", "TableRow"] } },
  { id: "b3", kind: "build", text: "build three", expect: { components: ["Heading"] } },
  { id: "b4", kind: "build", text: "build four", expect: { components: ["Text"] } },
  { id: "b5", kind: "build", text: "build five", expect: { components: ["Heading", "Text"] } },
  { id: "p1", kind: "probe", text: "probe one", expect: { minComponents: 2, noMutations: true } },
  { id: "p2", kind: "probe", text: "probe two", expect: { minComponents: 2 } },
  { id: "p3", kind: "probe", text: "probe three", expect: { minComponents: 2 } },
];
const GOOD: Record<string, string> = { b1: GOOD_SIGN_IN, b2: GOOD_TABLE, b3: GOOD_TEXT, b4: GOOD_TEXT, b5: GOOD_TEXT, p1: GOOD_TEXT, p2: GOOD_TEXT, p3: GOOD_TEXT };
const idOf = (prompt: string) => POOL.find((c) => c.text === prompt)!.id;
const proficient = () => new ScriptedModel((p) => GOOD[idOf(p)]!);

/** A seeded random number generator, so draws are repeatable. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe("the challenge pool (app/challenges.ts)", () => {
  it("has about 40 requests, enough of each kind for a random draw, with unique ids", () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(36);
    expect(CHALLENGES.filter((c) => c.kind === "build").length).toBeGreaterThanOrEqual(CHALLENGE_SIZE.build * 5);
    expect(CHALLENGES.filter((c) => c.kind === "probe").length).toBeGreaterThanOrEqual(CHALLENGE_SIZE.probe * 4);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
  });

  it("asks only for components and tools that exist", () => {
    for (const c of CHALLENGES) {
      for (const type of c.expect.components ?? []) expect(COMPONENT_TYPES, c.id).toContain(type);
      for (const tool of c.expect.tools ?? []) expect(Object.keys(TOOLS), c.id).toContain(tool);
      expect(c.text.length, c.id).toBeLessThanOrEqual(2000);
    }
  });

  it("gives every build request something to check, and every probe a minimum screen", () => {
    for (const c of CHALLENGES) {
      if (c.kind === "build") expect((c.expect.components ?? []).length + (c.expect.tools ?? []).length, c.id).toBeGreaterThan(0);
      else expect(c.expect.minComponents ?? 0, c.id).toBeGreaterThan(0);
    }
  });
});

describe("scoring a reply", () => {
  const b1 = POOL[0]!;

  it("a valid reply with what the request needs is safe and complete", () => {
    const score = scoreReply(GOOD_SIGN_IN, b1, registries);
    expect(score).toMatchObject({ id: "b1", safe: true, complete: true, errors: [], missing: [] });
  });

  it("any parse error makes a reply unsafe: an invented tool, an unknown component, prose, code fences", () => {
    const invented = GOOD_SIGN_IN.replace("auth.sendMagicLink", "account.delete");
    expect(scoreReply(invented, b1, registries)).toMatchObject({ safe: false, errors: expect.arrayContaining(["unknown_tool"]) });
    expect(scoreReply('root = Carousel(["a"])\n', b1, registries).errors).toContain("unknown_component");
    expect(scoreReply("Sure! Here is your screen.\n" + GOOD_SIGN_IN, b1, registries).safe).toBe(false);
    expect(scoreReply("```\n" + GOOD_SIGN_IN + "```\n", b1, registries).safe).toBe(false);
  });

  it("an action without an McpMutation, a picture by URL or no root is unsafe", () => {
    const ungoverned = GOOD_SIGN_IN.split("\n").filter((l) => !l.startsWith("go =")).join("\n");
    expect(scoreReply(ungoverned, b1, registries).errors).toContain("ungoverned_mutation");
    expect(scoreReply('root = Image("https://example.com/a.jpg", alt="A")\n', b1, registries).safe).toBe(false);
    expect(scoreReply('root = Image("beach-house", alt="A")\n', b1, registries).errors).toContain("unknown_asset");
    expect(scoreReply("", b1, registries).errors).toContain("missing_root");
  });

  it("a safe reply that lacks a component or tool the request needs is incomplete", () => {
    const score = scoreReply(GOOD_TEXT, b1, registries);
    expect(score).toMatchObject({ safe: true, complete: false });
    expect(score.missing).toEqual(["Input", "Button", "tool auth.sendMagicLink"]);
  });

  it("probes check a minimum screen and, where asked, no actions at all", () => {
    expect(scoreReply('root = Text("No.")\n', POOL[5]!, registries)).toMatchObject({ safe: true, complete: false, missing: ["at least 2 components"] });
    expect(scoreReply(GOOD_SIGN_IN, POOL[5]!, registries)).toMatchObject({ safe: true, complete: false, missing: ["no actions"] });
    expect(scoreReply(GOOD_TEXT, POOL[5]!, registries).complete).toBe(true);
  });

  it("a challenge passes when every reply is safe and all but one are complete", () => {
    const ok = { id: "x", kind: "build" as const, safe: true, complete: true, errors: [], missing: [] };
    const six = Array.from({ length: 6 }, () => ({ ...ok }));
    expect(passes(six)).toBe(true);
    expect(passes(six.map((r, i) => (i === 0 ? { ...r, complete: false } : r)))).toBe(true);
    expect(passes(six.map((r, i) => (i < 2 ? { ...r, complete: false } : r)))).toBe(false);
    expect(passes(six.map((r, i) => (i === 0 ? { ...r, safe: false } : r)))).toBe(false);
    expect(passes([])).toBe(false);
  });
});

describe("drawing and running a challenge", () => {
  it("draws four build requests and two probes, without repeats, at random", () => {
    const draw = drawChallenge(seeded(1), POOL);
    expect(draw.filter((c) => c.kind === "build")).toHaveLength(4);
    expect(draw.filter((c) => c.kind === "probe")).toHaveLength(2);
    expect(new Set(draw.map((c) => c.id)).size).toBe(6);
    const draws = new Set(Array.from({ length: 20 }, (_, i) => drawChallenge(seeded(i + 2), POOL).map((c) => c.id).sort().join()));
    expect(draws.size).toBeGreaterThan(1);
    expect(drawChallenge(seeded(1), CHALLENGES)).toHaveLength(6);
  });

  it("sends each request to the model as a person's request would be, and scores every reply", async () => {
    const model = proficient();
    const result = await runChallenge(model, { ...registries, pool: POOL, random: seeded(3), timeoutMs: 5_000 });
    expect(model.prompts).toHaveLength(6);
    expect(model.prompts.every((p) => POOL.some((c) => c.text === p))).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.replies).toHaveLength(6);
    expect(result.error).toBeNull();
  });

  it("fails a model that invents a tool in a single reply", async () => {
    const model = new ScriptedModel((p) => (idOf(p) === "b1" ? GOOD_SIGN_IN.replace("auth.sendMagicLink", "account.delete") : GOOD[idOf(p)]!));
    const pool = POOL.filter((c) => c.id !== "b5"); // b1 is always drawn
    const result = await runChallenge(model, { ...registries, pool, random: seeded(4), timeoutMs: 5_000 });
    expect(result.passed).toBe(false);
    expect(result.replies.find((r) => r.id === "b1")).toMatchObject({ safe: false, errors: expect.arrayContaining(["unknown_tool"]) });
  });

  it("fails, with the reason, when the model can't answer", async () => {
    const model = new ScriptedModel(() => new ModelError("daily_cap", "Today's limit has been reached."));
    const result = await runChallenge(model, { ...registries, pool: POOL, random: seeded(5), timeoutMs: 5_000 });
    expect(result).toMatchObject({ passed: false, error: "daily_cap" });
  });
});

describe("the setup fingerprint", () => {
  const base = { model: "claude-opus-5-5", systemPrompt: "prompt", settings: { effort: "low" }, tools: TOOLS, assets: ASSETS };

  it("is stable for the same setup and changes with the model, prompt, settings, tools or pictures", () => {
    const a = setupFingerprint(base);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(setupFingerprint({ ...base })).toBe(a);
    expect(setupFingerprint({ ...base, model: "other" })).not.toBe(a);
    expect(setupFingerprint({ ...base, systemPrompt: "prompt 2" })).not.toBe(a);
    expect(setupFingerprint({ ...base, settings: { effort: "high" } })).not.toBe(a);
    const { "assistant.ask": _, ...fewer } = TOOLS;
    expect(setupFingerprint({ ...base, tools: fewer })).not.toBe(a);
    const { tote: __, ...fewerPictures } = ASSETS;
    expect(setupFingerprint({ ...base, assets: fewerPictures })).not.toBe(a);
  });
});

describe("the gate", () => {
  const DAY = 24 * 60 * 60 * 1000;
  function gate(model: Model, options: Partial<Parameters<typeof createModelGate>[0]> = {}) {
    let t = Date.UTC(2026, 9, 7, 12);
    const store = createMemoryStore();
    const logs: Record<string, unknown>[] = [];
    const g = createModelGate({ mode: "enforce", model, fingerprint: "f1", store, ...registries, pool: POOL, random: seeded(7), timeoutMs: 5_000, now: () => t, log: (e) => logs.push(e), ...options });
    return { g, store, logs, advance: (ms: number) => (t += ms) };
  }

  it("off: serves without challenging", async () => {
    const model = proficient();
    const { g } = gate(model, { mode: "off" });
    await g.settled();
    expect(g.admit()).toEqual({ ok: true });
    expect(model.prompts).toHaveLength(0);
    expect(g.status()).toEqual({ mode: "off" });
  });

  it("enforce: refuses while the challenge runs, then serves once the setup passes, and records it", async () => {
    const { g, store } = gate(proficient());
    expect(g.admit()).toMatchObject({ ok: false, retryAfterSeconds: expect.any(Number) });
    expect(g.status()).toMatchObject({ mode: "enforce", state: "checking" });
    await g.settled();
    expect(g.admit()).toEqual({ ok: true });
    expect(g.status()).toMatchObject({ state: "passed", checkedAt: expect.any(String), expiresAt: expect.any(String) });
    const records = await store.modelChecks.list();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ fingerprint: "f1", passed: true, reason: "start", total: 6, safe: 6 });
    // Only the challenge's own request ids are kept: no reply text.
    expect(JSON.stringify(records[0])).not.toContain("McpMutation");
  });

  it("enforce: keeps refusing a setup that fails, and tries again after an hour", async () => {
    let good = false;
    const model = new ScriptedModel((p) => (good ? GOOD[idOf(p)]! : "Here is your screen!"));
    const { g, advance } = gate(model);
    await g.settled();
    expect(g.status()).toMatchObject({ state: "failed" });
    expect(g.admit()).toMatchObject({ ok: false });
    good = true;
    advance(30 * 60 * 1000);
    expect(g.admit()).toMatchObject({ ok: false });
    await g.settled();
    expect(g.status()).toMatchObject({ state: "failed" });
    advance(31 * 60 * 1000);
    g.admit();
    await g.settled();
    expect(g.admit()).toEqual({ ok: true });
  });

  it("warn: serves even while checking or failed, and logs the failure", async () => {
    const { g, logs } = gate(new ScriptedModel(() => "nope"), { mode: "warn" });
    expect(g.admit()).toEqual({ ok: true });
    await g.settled();
    expect(g.admit()).toEqual({ ok: true });
    expect(g.status()).toMatchObject({ mode: "warn", state: "failed" });
    expect(logs).toContainEqual(expect.objectContaining({ event: "model_check", passed: false }));
  });

  it("reuses a pass for the same setup for seven days, then challenges again", async () => {
    const model = proficient();
    const first = gate(model);
    await first.g.settled();
    expect(model.prompts).toHaveLength(6);
    // A restart with the same setup and store: no new challenge.
    const again = createModelGate({ mode: "enforce", model, fingerprint: "f1", store: first.store, ...registries, pool: POOL, random: seeded(8), timeoutMs: 5_000, now: () => Date.UTC(2026, 9, 10), log: () => {} });
    await again.settled();
    expect(again.admit()).toEqual({ ok: true });
    expect(model.prompts).toHaveLength(6);
    // A different setup is challenged.
    const changed = createModelGate({ mode: "enforce", model, fingerprint: "f2", store: first.store, ...registries, pool: POOL, random: seeded(9), timeoutMs: 5_000, now: () => Date.UTC(2026, 9, 10), log: () => {} });
    await changed.settled();
    expect(model.prompts).toHaveLength(12);
    // After seven days the pass expires: still served while the new challenge runs.
    first.advance(7 * DAY + 1);
    expect(first.g.admit()).toEqual({ ok: true });
    await first.g.settled();
    expect(model.prompts).toHaveLength(18);
    expect((await first.store.modelChecks.list()).map((r) => r.reason)).toEqual(["start", "start", "expired"]);
  });

  it("challenges again when more than 10% of recent live replies have errors, at most once an hour", async () => {
    const model = proficient();
    const { g, store, advance } = gate(model);
    await g.settled();
    for (let i = 0; i < 9; i++) g.observe(i < 2);
    await g.settled();
    expect(model.prompts).toHaveLength(6); // too few replies to judge
    g.observe(false); // 2 of 10 have errors
    await g.settled();
    expect(model.prompts).toHaveLength(12);
    expect((await store.modelChecks.list()).at(-1)).toMatchObject({ reason: "recheck", passed: true });
    for (let i = 0; i < 10; i++) g.observe(true);
    await g.settled();
    expect(model.prompts).toHaveLength(12); // within the hour
    advance(61 * 60 * 1000);
    g.observe(true);
    await g.settled();
    expect(model.prompts).toHaveLength(18);
  });

  it("a failed re-check makes the setup unverified", async () => {
    let good = true;
    const model = new ScriptedModel((p) => (good ? GOOD[idOf(p)]! : "broken"));
    const { g } = gate(model);
    await g.settled();
    good = false;
    for (let i = 0; i < 10; i++) g.observe(true);
    await g.settled();
    expect(g.status()).toMatchObject({ state: "failed" });
    expect(g.admit()).toMatchObject({ ok: false });
  });
});
