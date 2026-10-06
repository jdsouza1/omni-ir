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
    });
    expect(warnings).toEqual([]);
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
    expect(warnings).toHaveLength(1);
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
