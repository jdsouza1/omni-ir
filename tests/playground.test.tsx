// @vitest-environment jsdom
// Playground Task C: modes, streaming status, cancel and retry, with a scripted generate().
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GenerateClientOptions, GenerateOutcome } from "../client/generate";
import { Playground } from "../playground/Playground";

afterEach(cleanup);

/** A generate() the test drives: write lines into the run's parser, then finish it. */
function scriptedGenerate() {
  const runs: {
    prompt: string;
    options: GenerateClientOptions;
    write: (...lines: string[]) => void;
    finish: (outcome: GenerateOutcome) => Promise<void>;
  }[] = [];
  const generate = vi.fn((prompt: string, options: GenerateClientOptions) => {
    let resolve!: (o: GenerateOutcome) => void;
    const done = new Promise<GenerateOutcome>((r) => (resolve = r));
    options.signal?.addEventListener("abort", () => {
      options.parser.end();
      resolve({ status: "aborted" });
    });
    runs.push({
      prompt,
      options,
      write: (...lines) => act(() => options.parser.write(lines.join("\n") + "\n")),
      finish: async (outcome) => {
        await act(async () => {
          if (outcome.status !== "error" || outcome.code !== "invalid_request") options.parser.end();
          resolve(outcome);
          await done;
        });
      },
    });
    return done;
  });
  return { generate, runs };
}

const healthFetch: typeof fetch = async (input) => {
  if (String(input).endsWith("/api/health")) return new Response(JSON.stringify({ ok: true, model: "mock" }));
  return new Response("{}", { status: 404 });
};

async function setup() {
  const scripted = scriptedGenerate();
  render(<Playground generate={scripted.generate} fetch={healthFetch} />);
  await screen.findByText("mock model · free"); // let the health check settle inside act
  return { ...scripted, user: userEvent.setup(), status: () => screen.getByRole("status").textContent ?? "" };
}

const sourceText = () =>
  [...screen.getByLabelText("Omni-IR source").querySelectorAll(".pg-line-text")].map((el) => el.textContent).join("\n");

const DONE: GenerateOutcome = { status: "done", stopReason: "end_turn", model: "mock", ms: 12 };

describe("Playground: prompt mode", () => {
  it("starts idle, shows the free mock model, and needs a prompt to generate", async () => {
    const h = await setup();
    expect(h.status()).toMatch(/Describe a screen, pick an example/);
    expect(await screen.findByText("mock model · free")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Generate" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("The rendered screen appears here as it streams.")).toBeTruthy();
  });

  it("streams a screen into the source and preview, then reports done", async () => {
    const h = await setup();
    await h.user.type(screen.getByLabelText("Describe a screen"), "a payment screen");
    await h.user.click(screen.getByRole("button", { name: "Generate" }));
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.runs[0]!.prompt).toBe("a payment screen");
    expect(h.status()).toBe("Generating… 0 lines so far");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();

    h.runs[0]!.write("root = Card([title])");
    expect(h.status()).toBe("Generating… 1 line so far");
    expect(document.querySelector('[data-pending-id="title"]')).not.toBeNull();
    h.runs[0]!.write('title = Heading("Confirm payment")');
    expect(screen.getByRole("heading", { name: "Confirm payment" })).toBeTruthy();
    expect(sourceText()).toContain('title = Heading("Confirm payment")');

    await h.runs[0]!.finish(DONE);
    expect(h.status()).toBe("Done in 12 ms (model: mock).");
    expect(screen.getByRole("button", { name: "Generate" })).toBeTruthy();
  });

  it("an example chip fills the prompt and starts a run; chips are disabled while streaming", async () => {
    const h = await setup();
    await h.user.click(screen.getByRole("button", { name: "where is my order?" }));
    expect(h.runs[0]!.prompt).toBe("where is my order?");
    expect((screen.getByLabelText("Describe a screen") as HTMLInputElement).value).toBe("where is my order?");
    expect((screen.getByRole("button", { name: "contact support" }) as HTMLButtonElement).disabled).toBe(true);
    await h.runs[0]!.finish(DONE);
    expect((screen.getByRole("button", { name: "contact support" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Cancel aborts the request and marks what never arrived", async () => {
    const h = await setup();
    await h.user.click(screen.getByRole("button", { name: "a sign-in page" }));
    h.runs[0]!.write("root = Card([title, email])", 'title = Heading("Sign in")');
    await act(async () => {
      await h.user.click(screen.getByRole("button", { name: "Cancel" }));
    });
    expect(h.runs[0]!.options.signal?.aborted).toBe(true);
    expect(h.status()).toMatch(/^Cancelled\./);
    expect(document.querySelector('[data-fallback-reason="missing"][data-node-id="email"]')).not.toBeNull();
  });

  it("offers Retry for a retryable error, which re-runs the same prompt", async () => {
    const h = await setup();
    await h.user.click(screen.getByRole("button", { name: "demo: model error" }));
    await h.runs[0]!.finish({ status: "error", code: "model_error", message: "The mock model failed.", retryable: true });
    expect(h.status()).toMatch(/The mock model failed\. \(model_error\)/);
    await h.user.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.generate).toHaveBeenCalledTimes(2);
    expect(h.runs[1]!.prompt).toBe("demo: model error");
  });

  it("offers no Retry for a non-retryable error", async () => {
    const h = await setup();
    await h.user.click(screen.getByRole("button", { name: "contact support" }));
    await h.runs[0]!.finish({ status: "error", code: "invalid_request", message: "prompt: too long", retryable: false });
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("explains a cut-off response", async () => {
    const h = await setup();
    await h.user.click(screen.getByRole("button", { name: "demo: cut off" }));
    await h.runs[0]!.finish({ status: "done", stopReason: "max_tokens", model: "mock", ms: 5 });
    expect(h.status()).toMatch(/cut short/);
  });
});

describe("Playground: paste mode", () => {
  it("renders pasted Omni-IR without calling the server", async () => {
    const h = await setup();
    await h.user.click(screen.getByRole("tab", { name: "Paste Omni-IR" }));
    fireEvent.change(screen.getByLabelText("Omni-IR lines"), {
      target: { value: 'root = Card([t])\nt = Text("Pasted, with commas (and parens)")' },
    });
    await h.user.click(screen.getByRole("button", { name: "Render" }));
    expect(screen.getByText("Pasted, with commas (and parens)")).toBeTruthy();
    expect(h.status()).toBe("Rendered.");
    expect(h.generate).not.toHaveBeenCalled();
  });

  it("a new run replaces the old one, and a late update from the old run is ignored", async () => {
    const h = await setup();
    await h.user.click(screen.getByRole("button", { name: "edit my profile" }));
    h.runs[0]!.write("root = Card([a])");
    const oldSignal = h.runs[0]!.options.signal!;

    await h.user.click(screen.getByRole("tab", { name: "Paste Omni-IR" }));
    fireEvent.change(screen.getByLabelText("Omni-IR lines"), { target: { value: 'root = Heading("Fresh")' } });
    await h.user.click(screen.getByRole("button", { name: "Render" }));
    expect(oldSignal.aborted).toBe(true); // starting a new run cancels the old one
    expect(screen.getByRole("heading", { name: "Fresh" })).toBeTruthy();

    // The old run's parser keeps receiving text after cancellation: none of it may show.
    act(() => {
      try {
        h.runs[0]!.options.parser.write('a = Text("stale")\n');
      } catch {
        /* the old parser may already be ended */
      }
    });
    expect(screen.queryByText("stale")).toBeNull();
    expect(h.status()).toBe("Rendered.");
    expect(sourceText()).toBe('root = Heading("Fresh")');
  });
});
