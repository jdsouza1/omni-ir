// Simulates an LLM token stream: random-sized UTF-8 byte chunks with small delays.
// Byte chunks are cut anywhere, including in the middle of lines and of multi-byte characters.

export interface MockStreamOptions {
  /** Seed for reproducible chunking. */
  seed?: number;
  minChunk?: number;
  maxChunk?: number;
  /** Maximum delay between chunks in ms (0 = no timers). */
  maxDelayMs?: number;
}

/** Small deterministic PRNG (mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split text into random-sized byte chunks. */
export function chunkBytes(text: string, options: MockStreamOptions = {}): Uint8Array[] {
  const { seed = 1, minChunk = 1, maxChunk = 12 } = options;
  const rand = random(seed);
  const bytes = new TextEncoder().encode(text);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; ) {
    const size = minChunk + Math.floor(rand() * (maxChunk - minChunk + 1));
    chunks.push(bytes.subarray(i, i + size));
    i += size;
  }
  return chunks;
}

export async function* mockStream(text: string, options: MockStreamOptions = {}): AsyncGenerator<Uint8Array> {
  const rand = random((options.seed ?? 1) + 7919);
  const maxDelay = options.maxDelayMs ?? 0;
  for (const chunk of chunkBytes(text, options)) {
    if (maxDelay > 0) await new Promise((resolve) => setTimeout(resolve, Math.floor(rand() * maxDelay)));
    yield chunk;
  }
}
