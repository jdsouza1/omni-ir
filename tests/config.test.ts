import { ConfigError, loadConfig } from "../server/config";

describe("loadConfig", () => {
  it("defaults to the free mock model with safe limits", () => {
    const { config, warnings } = loadConfig({});
    expect(config).toEqual({
      port: 8787,
      model: "mock",
      effort: "low",
      timeoutMs: 120_000,
      corsOrigin: "http://localhost:5173",
      rateLimitPerMinute: 10,
      dailyCap: 50,
      mockSpeed: "realistic",
      trustProxy: false,
      auth: "magic-link",
      publicUrl: "http://localhost:5173",
      dbPath: null,
      modelCheck: "off",
    });
    expect(warnings).toEqual([]);
  });

  it("checks a real model by default and never the mock (PLAN-MODELCHECK.md, decision 1)", () => {
    expect(loadConfig({ OMNI_MODEL: "claude" }).config.modelCheck).toBe("enforce");
    expect(loadConfig({ OMNI_MODEL: "claude", OMNI_MODEL_CHECK: "warn" }).config.modelCheck).toBe("warn");
    expect(loadConfig({ OMNI_MODEL: "claude", OMNI_MODEL_CHECK: "off" }).config.modelCheck).toBe("off");
    expect(loadConfig({ OMNI_MODEL_CHECK: "enforce" }).config.modelCheck).toBe("enforce");
    expect(() => loadConfig({ OMNI_MODEL_CHECK: "strict" })).toThrow(ConfigError);
    expect(loadConfig({ OMNI_MODEL: "claude" }).warnings.join(" ")).toMatch(/model check.*six generations/i);
  });

  it("parses numbers and enums from strings", () => {
    const { config } = loadConfig({ PORT: "3000", OMNI_DAILY_CAP: "5", OMNI_MOCK_SPEED: "instant", OMNI_EFFORT: "medium" });
    expect(config).toMatchObject({ port: 3000, dailyCap: 5, mockSpeed: "instant", effort: "medium" });
  });

  it("treats empty variables as unset", () => {
    expect(loadConfig({ PORT: "", OMNI_MODEL: "" }).config).toMatchObject({ port: 8787, model: "mock" });
  });

  it("rejects invalid values with one readable error listing every problem", () => {
    let error: unknown;
    try {
      loadConfig({ PORT: "99999", OMNI_MODEL: "gpt", OMNI_CORS_ORIGIN: "not a url" });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const message = (error as Error).message;
    expect(message).toContain("PORT");
    expect(message).toContain("OMNI_MODEL");
    expect(message).toContain("OMNI_CORS_ORIGIN");
  });

  it("warns that the Claude model costs money and names the daily cap", () => {
    const { warnings } = loadConfig({ OMNI_MODEL: "claude", ANTHROPIC_API_KEY: "sk-test", OMNI_DAILY_CAP: "20" });
    expect(warnings).toHaveLength(2); // and the model check's generations
    expect(warnings[0]).toMatch(/billed per request/);
    expect(warnings[0]).toMatch(/20/);
  });

  it("warns when Claude is selected without a key in the environment", () => {
    const { warnings } = loadConfig({ OMNI_MODEL: "claude" });
    expect(warnings.some((w) => /ant auth login/.test(w))).toBe(true);
  });

  it("never includes a secret in the returned config", () => {
    const { config } = loadConfig({ OMNI_MODEL: "claude", ANTHROPIC_API_KEY: "sk-secret-value" });
    expect(JSON.stringify(config)).not.toContain("sk-secret-value");
  });
});
