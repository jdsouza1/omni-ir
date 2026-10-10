// FixtureModel: streams pre-written Omni-IR screens, chosen by keywords in the prompt, in
// random-sized chunks with model-like timing. It costs nothing and needs no API key. Prompts
// starting with "demo:" replay the failure cases so every error path can be shown.
// It imports nothing from Node, so the hosted playground runs it in the browser; MockModel
// (mock.ts) is the same model reading fixtures/ from disk.
import { chunkText, random } from "../../app/mockStream";
import { ModelError, type GenerateOptions, type GenerateResult, type Model } from "./types";

export interface FixtureModelOptions {
  speed?: "instant" | "realistic";
  /** Seed for reproducible chunking and timing; random when omitted. */
  seed?: number;
  /** A fixture's text by id, such as "sign-in" or "variants/unknown-tool". */
  read: (id: string) => string;
}

/** Screens in priority order: on a keyword tie, the earlier one wins. */
const SCREENS: { id: string; keywords: string[] }[] = [
  { id: "payment-confirmation", keywords: ["pay", "payment", "payments", "checkout", "purchase", "confirm", "confirmation", "billing"] },
  { id: "sign-in", keywords: ["login", "log", "signin", "sign", "auth", "authenticate"] },
  { id: "profile-settings", keywords: ["profile", "settings", "account", "preferences"] },
  { id: "sales-dashboard", keywords: ["sales", "revenue", "analytics", "chart", "charts", "trend", "visitors"] },
  { id: "order-breakdown", keywords: ["breakdown", "pie", "share", "channel", "channels", "split"] },
  { id: "account-settings", keywords: ["notifications", "notification", "language", "alerts", "toggle", "switch", "tabs"] },
  { id: "order-history", keywords: ["history", "past", "previous", "table", "invoices"] },
  { id: "order-status", keywords: ["order", "orders", "track", "tracking", "shipping", "delivery", "shipment", "package"] },
  { id: "support-contact", keywords: ["support", "help", "contact", "ticket"] },
  // The demo app's own components (Step 20).
  { id: "product", keywords: ["product", "tote", "quantity", "shop", "item"] },
  // The landing page examples.
  { id: "landing/booking", keywords: ["book", "booking", "stay", "reserve", "reservation", "cabin"] },
  { id: "landing/checkout", keywords: ["bag", "cart", "basket"] },
  { id: "landing/assistant", keywords: ["assistant", "chat", "ask", "question", "trip"] },
];
const FALLBACK = "demo-mode";

const DEMOS: Record<string, string> = {
  "unknown tool": "variants/unknown-tool",
  "missing child": "variants/dangling-child",
  "missing mutation": "variants/missing-mutation",
  "windows path": "variants/windows-path",
  "cut off": "cut-off",
  "model error": "model-error",
};

// Timing for "realistic" speed: a pause before the first text (the model "thinking"), then short gaps.
const FIRST_TEXT_DELAY_MS = 400;
const CHUNK_DELAY_MS: [number, number] = [15, 45];

export class FixtureModel implements Model {
  readonly kind = "mock" as const;
  private readonly speed: "instant" | "realistic";
  private readonly seed: number | undefined;
  private readonly read: (id: string) => string;
  private readonly cache = new Map<string, string>();

  constructor(options: FixtureModelOptions) {
    this.speed = options.speed ?? "realistic";
    this.seed = options.seed;
    this.read = options.read;
  }

  /** Which screen a prompt maps to: a fixture path, "cut-off", "model-error" or "demo-mode". */
  route(prompt: string): string {
    const demo = /^\s*demo\s*:\s*(.*)$/i.exec(prompt);
    if (demo) {
      const name = demo[1]!.toLowerCase().replace(/\s+/g, " ").trim();
      return DEMOS[name] ?? FALLBACK;
    }
    const words = new Set(prompt.toLowerCase().split(/[^a-z0-9]+/));
    let best = FALLBACK;
    let bestScore = 0;
    for (const screen of SCREENS) {
      const score = screen.keywords.filter((k) => words.has(k)).length;
      if (score > bestScore) {
        best = screen.id;
        bestScore = score;
      }
    }
    return best;
  }

  async generate(prompt: string, { signal, onText }: GenerateOptions): Promise<GenerateResult> {
    throwIfAborted(signal);
    const route = this.route(prompt);
    const seed = this.seed ?? Math.floor(Math.random() * 2 ** 31);
    const rand = random(seed + 1);

    let text: string;
    let stopReason: GenerateResult["stopReason"] = "end_turn";
    let failAfter = false;
    if (route === "cut-off") {
      text = cutMidLine(this.load("payment-confirmation"), 0.6);
      stopReason = "max_tokens";
    } else if (route === "model-error") {
      text = cutMidLine(this.load("payment-confirmation"), 0.4);
      failAfter = true;
    } else {
      text = this.load(route);
    }

    if (this.speed === "realistic") await sleep(FIRST_TEXT_DELAY_MS, signal);
    for (const chunk of chunkText(text, { seed })) {
      throwIfAborted(signal);
      onText(chunk);
      throwIfAborted(signal);
      if (this.speed === "realistic") {
        const [min, max] = CHUNK_DELAY_MS;
        await sleep(min + rand() * (max - min), signal);
      } else {
        await Promise.resolve(); // still yield between chunks, like a real stream
      }
    }

    if (failAfter) throw new ModelError("model_error", "The mock model failed partway through (demo).", true);
    return { stopReason, model: "mock" };
  }

  private load(id: string): string {
    let source = this.cache.get(id);
    if (source === undefined) {
      source = this.read(id);
      this.cache.set(id, source);
    }
    return source;
  }
}

/** The first `fraction` of the text, moved forward if needed so it never ends exactly at a line break. */
function cutMidLine(text: string, fraction: number): string {
  let cut = Math.floor(text.length * fraction);
  while (cut < text.length && (text[cut - 1] === "\n" || text[cut] === "\n")) cut++;
  return text.slice(0, cut);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new ModelError("aborted", "Generation was cancelled.");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ModelError("aborted", "Generation was cancelled."));
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ModelError("aborted", "Generation was cancelled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
