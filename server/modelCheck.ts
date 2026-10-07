// The model check (PLAN-MODELCHECK.md, SPEC.md [10.21]–[10.24]): before a model writes screens for
// people, the server challenges it with requests drawn at random from a pool and scores each reply
// with the real parser, like a second factor that tests proficiency instead of identity. A pass
// clears one setup (model, system prompt, settings, tools, pictures) for seven days; live replies
// that start failing trigger a new challenge.
//
// It checks proficiency, not safety: the parser still checks every line of every screen.
import { createHash } from "node:crypto";
import { z } from "zod";
import { createParser, OMNI_IR_VERSION, type ToolRegistry } from "@omni-ir/core";
import type { AssetRegistry } from "../app/assets";
import { CHALLENGES, type Challenge } from "../app/challenges";
import type { ModelCheckRecord, Store } from "./backend/types";
import { ModelError, type Model } from "./models/types";

/** How many requests of each kind a challenge draws (decision 3). */
export const CHALLENGE_SIZE = { build: 4, probe: 2 } as const;
/** How long a pass holds for an unchanged setup (decision 2). */
export const PASS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A failed setup, or one whose live replies keep failing, is challenged at most this often (decision 5). */
export const RECHECK_INTERVAL_MS = 60 * 60 * 1000;
/** Live re-check: the replies looked at, the fewest needed to judge, and the error rate that triggers it. */
export const LIVE_WINDOW = { size: 50, minimum: 10, maxErrorRate: 0.1 } as const;
/** Requests run at once during a challenge. */
const CONCURRENCY = 3;
/** Seconds a refused client waits while a challenge runs. */
const CHECKING_RETRY_AFTER_S = 15;

export interface Registries {
  tools: ToolRegistry;
  assets: AssetRegistry;
}

/** How one reply scored. Codes and ids only: the reply itself is never kept. */
export interface ReplyScore {
  id: string;
  kind: Challenge["kind"];
  /** No parse error at all (section 7): the safety rules. */
  safe: boolean;
  /** Has what the request needed: the quality rules. */
  complete: boolean;
  /** The parse errors' codes, each once. */
  errors: string[];
  /** What the request needed and the reply lacks. */
  missing: string[];
}

export function scoreReply(text: string, challenge: Challenge, { tools, assets }: Registries): ReplyScore {
  const parser = createParser({ tools, assets });
  const errors = new Set<string>();
  parser.subscribe((e) => {
    if (e.type === "error") errors.add(e.issue.code);
  });
  parser.write(text);
  parser.end();
  const doc = parser.getSnapshot();
  const types = new Set([...doc.nodes.values()].map((n) => n.type));
  const used = new Set([...doc.mutations.values()].map((m) => m.tool));
  const { components = [], tools: needed = [], minComponents, noMutations } = challenge.expect;
  const missing = [
    ...components.filter((type) => !types.has(type)),
    ...needed.filter((tool) => !used.has(tool)).map((tool) => `tool ${tool}`),
    ...(minComponents !== undefined && doc.nodes.size < minComponents ? [`at least ${minComponents} components`] : []),
    ...(noMutations && doc.mutations.size > 0 ? ["no actions"] : []),
  ];
  return { id: challenge.id, kind: challenge.kind, safe: errors.size === 0, complete: missing.length === 0, errors: [...errors], missing };
}

/** The pass rule (decision 4): every reply safe, and all but one complete. */
export function passes(replies: readonly ReplyScore[]): boolean {
  return replies.length > 0 && replies.every((r) => r.safe) && replies.filter((r) => r.complete).length >= replies.length - 1;
}

/** Four build requests and two probes, drawn at random without repeats. */
export function drawChallenge(random: () => number = Math.random, pool: readonly Challenge[] = CHALLENGES): Challenge[] {
  const pick = (kind: Challenge["kind"], count: number) => {
    const left = pool.filter((c) => c.kind === kind);
    const chosen: Challenge[] = [];
    while (chosen.length < count && left.length > 0) chosen.push(left.splice(Math.floor(random() * left.length), 1)[0]!);
    return chosen;
  };
  return [...pick("build", CHALLENGE_SIZE.build), ...pick("probe", CHALLENGE_SIZE.probe)];
}

export interface ChallengeOptions extends Registries {
  pool?: readonly Challenge[];
  random?: () => number;
  /** Longest wait for one reply. */
  timeoutMs: number;
}

export interface ChallengeResult {
  passed: boolean;
  /** The requests drawn, by id. */
  requests: string[];
  replies: ReplyScore[];
  /** The model's error code when it couldn't answer (then the challenge fails), or null. */
  error: string | null;
}

/** Send a drawn challenge to the model, as people's requests are sent, and score every reply. */
export async function runChallenge(model: Model, { pool, random, timeoutMs, ...registries }: ChallengeOptions): Promise<ChallengeResult> {
  const drawn = drawChallenge(random, pool);
  const replies: (ReplyScore | undefined)[] = [];
  let error: string | null = null;
  let next = 0;
  const worker = async () => {
    while (error === null && next < drawn.length) {
      const index = next++;
      const challenge = drawn[index]!;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let text = "";
      try {
        await model.generate(challenge.text, { signal: controller.signal, onText: (piece) => (text += piece) });
        replies[index] = scoreReply(text, challenge, registries);
      } catch (err) {
        error ??= controller.signal.aborted ? "timeout" : err instanceof ModelError ? err.code : "model_error";
      } finally {
        clearTimeout(timer);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, drawn.length) }, worker));
  const scored = replies.filter((r): r is ReplyScore => r !== undefined);
  return { passed: error === null && scored.length === drawn.length && passes(scored), requests: drawn.map((c) => c.id), replies: scored, error };
}

export interface SetupParts extends Registries {
  model: string;
  systemPrompt: string;
  settings?: Record<string, unknown>;
}

/** The setup's fingerprint ([10.22]): anything that changes what the model writes or what is accepted. */
export function setupFingerprint({ model, systemPrompt, settings = {}, tools, assets }: SetupParts): string {
  const sorted = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  const toolSchemas = Object.keys(tools)
    .sort()
    .map((name) => [name, z.toJSONSchema(tools[name]!, { unrepresentable: "any" })]);
  const pictures = Object.keys(assets)
    .sort()
    .map((name) => [name, assets[name]!.src]);
  // The package version stands for the catalog and the parser that score the replies.
  const setup = { model, systemPrompt, settings: sorted(settings), tools: toolSchemas, pictures, catalog: OMNI_IR_VERSION };
  return createHash("sha256").update(JSON.stringify(setup)).digest("hex");
}

export type Admission = { ok: true } | { ok: false; retryAfterSeconds: number; message: string };

export type ModelCheckStatus =
  | { mode: "off" }
  | { mode: "enforce" | "warn"; state: "checking" | "passed" | "failed"; fingerprint: string; checkedAt?: string; expiresAt?: string };

export interface ModelGate {
  /** May a person's request be served now? Starts a due challenge as a side effect. */
  admit(): Admission;
  /** Report a finished live reply: whether the parser found errors in it. */
  observe(hadErrors: boolean): void;
  /** Resolves when no challenge is running (for tests and shutdown). */
  settled(): Promise<void>;
  status(): ModelCheckStatus;
}

export interface ModelGateOptions extends ChallengeOptions {
  mode: "enforce" | "warn" | "off";
  model: Model;
  fingerprint: string;
  store: Pick<Store, "modelChecks">;
  now?: () => number;
  log?: (entry: Record<string, unknown>) => void;
}

export function createModelGate(options: ModelGateOptions): ModelGate {
  const { mode, model, fingerprint, store, now = Date.now, log = () => {} } = options;
  let state: "checking" | "passed" | "failed" = "checking";
  let passedAt: number | null = null;
  let lastCheckAt: number | null = null;
  let lastRecheckAt: number | null = null;
  let running: Promise<void> | null = null;
  let live: boolean[] = [];

  async function challenge(reason: ModelCheckRecord["reason"]) {
    const at = now();
    lastCheckAt = at;
    if (reason === "recheck") lastRecheckAt = at;
    if (state !== "passed") state = "checking";
    let result: ChallengeResult;
    try {
      result = await runChallenge(model, options);
    } catch {
      result = { passed: false, requests: [], replies: [], error: "check_failed" };
    }
    const record: ModelCheckRecord = {
      at,
      fingerprint,
      model: model.setup?.id ?? model.kind,
      reason,
      passed: result.passed,
      requests: result.requests,
      total: result.requests.length,
      safe: result.replies.filter((r) => r.safe).length,
      complete: result.replies.filter((r) => r.complete).length,
      error: result.error,
    };
    try {
      await store.modelChecks.add(record);
    } catch (err) {
      log({ event: "model_check", outcome: "not_recorded", error: err instanceof Error ? err.message : String(err) });
    }
    const failures = result.replies.filter((r) => !r.safe || !r.complete).map((r) => ({ id: r.id, errors: r.errors, missing: r.missing }));
    log({ event: "model_check", mode, ...record, failures });
    if (result.passed) {
      state = "passed";
      passedAt = at;
      live = [];
    } else {
      state = "failed";
      passedAt = null;
    }
  }

  function start(work: () => Promise<void>) {
    if (running) return;
    running = work().finally(() => {
      running = null;
    });
  }

  if (mode !== "off") {
    start(async () => {
      const kept = await store.modelChecks.latestPass(fingerprint, now() - PASS_TTL_MS).catch(() => null);
      if (kept) {
        state = "passed";
        passedAt = kept.at;
        lastCheckAt = kept.at;
      } else await challenge("start");
    });
  }

  return {
    admit() {
      if (mode === "off") return { ok: true };
      const t = now();
      if (state === "passed" && passedAt !== null && t - passedAt > PASS_TTL_MS) start(() => challenge("expired"));
      if (state === "failed" && !running && (lastCheckAt === null || t - lastCheckAt >= RECHECK_INTERVAL_MS)) start(() => challenge("retry"));
      if (mode === "warn" || state === "passed") return { ok: true };
      if (running) {
        return { ok: false, retryAfterSeconds: CHECKING_RETRY_AFTER_S, message: "The model is being checked before it writes screens; try again shortly." };
      }
      const wait = lastCheckAt === null ? 1 : Math.max(1, Math.ceil((lastCheckAt + RECHECK_INTERVAL_MS - t) / 1000));
      return { ok: false, retryAfterSeconds: wait, message: "The model didn't pass its check, so it can't write screens yet; try again later." };
    },

    observe(hadErrors) {
      if (mode === "off") return;
      live.push(hadErrors);
      if (live.length > LIVE_WINDOW.size) live = live.slice(-LIVE_WINDOW.size);
      const failing = live.filter(Boolean).length / live.length > LIVE_WINDOW.maxErrorRate;
      const due = lastRecheckAt === null || now() - lastRecheckAt >= RECHECK_INTERVAL_MS;
      if (state === "passed" && !running && live.length >= LIVE_WINDOW.minimum && failing && due) {
        live = [];
        start(() => challenge("recheck"));
      }
    },

    async settled() {
      while (running) await running;
    },

    status() {
      if (mode === "off") return { mode };
      return {
        mode,
        state,
        fingerprint,
        ...(lastCheckAt !== null ? { checkedAt: new Date(lastCheckAt).toISOString() } : {}),
        ...(state === "passed" && passedAt !== null ? { expiresAt: new Date(passedAt + PASS_TTL_MS).toISOString() } : {}),
      };
    },
  };
}
