// Octen embeddings — the most aphasia-specific component in the build.
// Anomia produces circumlocution: "the boily thing" for kettle. No substring
// of that appears in any record; semantic similarity is what finds it.
//
// API (verified against https://docs.octen.ai/api-reference/embedding):
//   POST {OCTEN_API_URL}/embedding
//   headers: x-api-key
//   body: { input: string[], model, input_type: "query" | "document" }
//   response: { code: 0, data: { results: [{ index, embedding }] } }
//
// Every call has a timeout and throws cleanly; callers fall back to the
// precomputed table / keyword matching. The user never sees a failure.

const OCTEN_URL = process.env.OCTEN_API_URL ?? "https://api.octen.ai";
const OCTEN_MODEL = process.env.OCTEN_MODEL ?? "octen-embedding-4b";

export function octenConfigured(): boolean {
  return Boolean(process.env.OCTEN_API_KEY);
}

export async function embedTexts(
  texts: string[],
  inputType: "query" | "document",
  timeoutMs = 2200
): Promise<number[][]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OCTEN_URL}/embedding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.OCTEN_API_KEY ?? "",
      },
      body: JSON.stringify({ input: texts, model: OCTEN_MODEL, input_type: inputType }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Octen HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 0 || !Array.isArray(json.data?.results)) {
      throw new Error(`Octen error: ${json.msg ?? "malformed response"}`);
    }
    // Align strictly by the response's index field and demand completeness —
    // a short or sparse batch throws (callers fall back cleanly and nothing
    // gets cached), rather than silently mis-associating vectors.
    const byIndex = new Map<number, number[]>();
    for (const r of json.data.results as { index: number; embedding: number[] }[]) {
      if (Array.isArray(r.embedding) && r.embedding.length > 0) {
        byIndex.set(r.index, r.embedding);
      }
    }
    return texts.map((_, i) => {
      const v = byIndex.get(i);
      if (!v) throw new Error(`Octen returned no embedding for input ${i} of ${texts.length}`);
      return v;
    });
  } finally {
    clearTimeout(timer);
  }
}

export function similarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// Hypothesis-document vectors, cached in memory for the life of the server.
const docCache = new Map<string, number[]>();

/**
 * Embed each hypothesis document (title + variants), reusing cached vectors.
 * One batched call covers all cache misses.
 */
export async function embedHypothesisDocs(
  docs: { key: string; text: string }[]
): Promise<Map<string, number[]>> {
  const misses = docs.filter((d) => !docCache.has(d.key));
  if (misses.length > 0) {
    const vectors = await embedTexts(misses.map((d) => d.text), "document");
    // embedTexts guarantees completeness, but never cache a hole regardless —
    // a poisoned cache entry would disable live embeddings until restart.
    misses.forEach((d, i) => {
      if (vectors[i]) docCache.set(d.key, vectors[i]);
    });
  }
  const out = new Map<string, number[]>();
  for (const d of docs) {
    const v = docCache.get(d.key);
    if (v) out.set(d.key, v);
  }
  return out;
}

/**
 * The precomputed similarity table — the offline guarantee for the golden
 * paths. Keyed by normalized fragment, values are per-kind similarities.
 * Tuned until Path A ranks duplicate_charge → wrong_item → late_delivery and
 * Path B ranks wrong_item first, then LOCKED. Do not retune casually.
 */
export const PRECOMPUTED: Record<string, Record<string, number>> = {
  "order wrong the thing help": {
    duplicate_charge: 0.9,
    wrong_item: 0.62,
    late_delivery: 0.3,
    refund_pending: 0.1,
    unexpected_renewal: 0.05,
  },
  "the boily thing broke": {
    wrong_item: 0.95,
    late_delivery: 0.2,
    duplicate_charge: 0.15,
    refund_pending: 0.05,
    unexpected_renewal: 0.02,
  },
};

export function normalizeFragment(fragment: string): string {
  return fragment.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
