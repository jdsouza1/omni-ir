// createMutationHandler and the action endpoint's rules ([10.14], PLAN-BACKEND.md D.3): an
// idempotency key per press, kept when a dropped connection is retried, credentials sent, and the
// server's refusals reported in its own words.
import { createMutationHandler, MutationRejectedError, type MutationCall } from "@omni-ir/react";

const call: MutationCall = { id: "payM", target: "pay", tool: "payments.confirm", params: { amount: 42.5, note: "" } };
type Sent = { url: string; init: RequestInit };

function recording(answers: (() => Response | Promise<Response>)[]) {
  const sent: Sent[] = [];
  const fetch: typeof globalThis.fetch = async (input, init = {}) => {
    sent.push({ url: String(input), init });
    const next = answers.shift();
    if (!next) throw new Error("no more answers");
    return next();
  };
  return { sent, fetch };
}
const ok = () => new Response(JSON.stringify({ ok: true, tool: "payments.confirm", result: { receiptId: "rcpt_1" } }), { status: 200 });
const header = (s: Sent, name: string) => new Headers(s.init.headers).get(name);

describe("createMutationHandler", () => {
  it("sends a new idempotency key for each press, and the session cookie with same-origin requests", async () => {
    const { sent, fetch } = recording([ok, ok]);
    const handle = createMutationHandler({ fetch });
    await handle(call);
    await handle(call);
    const [a, b] = sent.map((s) => header(s, "idempotency-key"));
    expect(a).toMatch(/^[A-Za-z0-9_\-:.]{1,200}$/);
    expect(b).not.toBe(a);
    expect(sent[0]!.init.credentials).toBe("same-origin");
  });

  it("retries once after a dropped connection, with the same key, so the server can't run it twice", async () => {
    const { sent, fetch } = recording([
      () => {
        throw new TypeError("network down");
      },
      ok,
    ]);
    const results: unknown[] = [];
    await createMutationHandler({ fetch, onResult: (_, r) => void results.push(r) })(call);
    expect(sent).toHaveLength(2);
    expect(header(sent[1]!, "idempotency-key")).toBe(header(sent[0]!, "idempotency-key"));
    expect(results).toEqual([{ receiptId: "rcpt_1" }]);
  });

  it("gives up after the retry fails too, without a third try", async () => {
    const down = () => {
      throw new TypeError("network down");
    };
    const { sent, fetch } = recording([down, down, ok]);
    await expect(createMutationHandler({ fetch })(call)).rejects.toThrow("Could not reach the server.");
    expect(sent).toHaveLength(2);
  });

  it("sends a bearer token when given one, and credentials for another origin when asked", async () => {
    const { sent, fetch } = recording([ok, ok]);
    await createMutationHandler({ fetch, token: "abc", baseUrl: "https://api.example" })(call);
    expect(header(sent[0]!, "authorization")).toBe("Bearer abc");
    await createMutationHandler({ fetch, credentials: "include", baseUrl: "https://api.example" })(call);
    expect(sent[1]!.init.credentials).toBe("include");
  });

  it.each([
    [401, "sign_in_required", "Sign in to do this."],
    [404, "not_found", "That wasn't found."],
    [409, "unavailable", "Those dates are already taken."],
  ])("reports a %i in the server's words", async (status, code, message) => {
    const { fetch } = recording([() => new Response(JSON.stringify({ error: { code, message, retryable: false } }), { status })]);
    const error = await createMutationHandler({ fetch })(call).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MutationRejectedError);
    expect((error as MutationRejectedError).message).toBe(message);
    expect((error as MutationRejectedError).code).toBe(code);
  });
});
