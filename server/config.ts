// Server configuration from environment variables. Defaults cost nothing: the mock model is used
// unless OMNI_MODEL=claude is set explicitly. Credentials are never copied into the config object;
// the Anthropic SDK reads them from the environment (or an `ant auth login` profile) itself.
import { z } from "zod";

export type ModelKind = "mock" | "claude";

export interface ServerConfig {
  port: number;
  model: ModelKind;
  /** Claude effort level; ignored by the mock model. */
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  timeoutMs: number;
  corsOrigin: string;
  rateLimitPerMinute: number;
  /** Maximum Claude generations per day (the mock model is never capped). */
  dailyCap: number;
  /** "instant" for tests, "realistic" for demos. */
  mockSpeed: "instant" | "realistic";
  /**
   * Which proxies may report the client's address (Express's "trust proxy"): false (none, the
   * default), a number of hops, or addresses and subnets such as "loopback" or "10.0.0.0/8" ([10.15]).
   */
  trustProxy: false | number | string[];
}

export class ConfigError extends Error {}

const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  OMNI_MODEL: z.enum(["mock", "claude"]).default("mock"),
  OMNI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  OMNI_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  OMNI_CORS_ORIGIN: z.url().default("http://localhost:5173"),
  OMNI_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(10),
  OMNI_DAILY_CAP: z.coerce.number().int().nonnegative().default(50),
  OMNI_MOCK_SPEED: z.enum(["instant", "realistic"]).default("realistic"),
  // "true" would trust every hop, so any client could forge its address with X-Forwarded-For.
  OMNI_TRUST_PROXY: z
    .string()
    .trim()
    .refine((v) => v !== "true", "true would trust a header anyone can write; give the number of proxies or their addresses")
    .transform((v): false | number | string[] => (v === "false" ? false : /^\d+$/.test(v) ? Number(v) : v.split(",").map((a) => a.trim()).filter(Boolean)))
    .default(false),
});

export function loadConfig(env: Record<string, string | undefined> = process.env): {
  config: ServerConfig;
  warnings: string[];
} {
  // An empty variable (e.g. `PORT=`) means "not set", not zero.
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ""));
  const parsed = Env.safeParse(present);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new ConfigError(`Invalid server configuration:\n${problems.join("\n")}`);
  }
  const e = parsed.data;
  const config: ServerConfig = {
    port: e.PORT,
    model: e.OMNI_MODEL,
    effort: e.OMNI_EFFORT,
    timeoutMs: e.OMNI_TIMEOUT_MS,
    corsOrigin: e.OMNI_CORS_ORIGIN,
    rateLimitPerMinute: e.OMNI_RATE_LIMIT_PER_MIN,
    dailyCap: e.OMNI_DAILY_CAP,
    mockSpeed: e.OMNI_MOCK_SPEED,
    trustProxy: e.OMNI_TRUST_PROXY,
  };

  const warnings: string[] = [];
  if (config.model === "claude") {
    warnings.push(
      `OMNI_MODEL=claude: every generation calls the Claude API and is billed per request (daily cap: ${config.dailyCap}).`,
    );
    if (!present.ANTHROPIC_API_KEY && !present.ANTHROPIC_AUTH_TOKEN) {
      warnings.push("No ANTHROPIC_API_KEY in the environment; the SDK will try an `ant auth login` profile instead.");
    }
  }
  return { config, warnings };
}
