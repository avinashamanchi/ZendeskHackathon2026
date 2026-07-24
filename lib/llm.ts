import OpenAI from "openai";
import type { Hypothesis } from "./types";
import { legacyFallback } from "./legacy-fallback";

// OpenAI wrappers. Each has a hard timeout and a deterministic fallback —
// the UI must proceed identically whether or not the network exists.

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

let client: OpenAI | null = null;
function openai(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

const CARD_COPY_SYSTEM = `You write interface copy for people with expressive aphasia. They understand
everything you write; they cannot produce words themselves. Write in plain,
concrete, second-person language.

Rules:
- Title: 3 to 7 words. Sentence case. No question marks. No jargon.
- Detail: exactly one sentence, under 20 words, containing the specific
  number, date, or item name.
- Never use: "issue", "concern", "regarding", "we apologise", "it appears".
- Never hedge. Say what happened.
- Return strict JSON: {"title": string, "detail": string}. No markdown,
  no preamble.`;

/**
 * Polishes a card's copy. On any failure — no key, timeout, malformed JSON,
 * rule violation — returns null and the caller keeps the deterministic
 * template copy already on the hypothesis. Copy can only get better, never
 * missing.
 */
export async function generateCardCopy(
  hypothesis: Pick<Hypothesis, "kind" | "title" | "detail" | "evidence">,
  timeoutMs = 4000
): Promise<{ title: string; detail: string } | null> {
  const api = openai();
  if (!api) return null;
  try {
    const res = await api.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: CARD_COPY_SYSTEM },
          {
            role: "user",
            content:
              `What happened (${hypothesis.kind}): ${hypothesis.title}. ${hypothesis.detail}\n` +
              `Facts:\n${hypothesis.evidence.join("\n")}`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 120,
      },
      { timeout: timeoutMs, maxRetries: 0 }
    );
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "");
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const detail = typeof parsed.detail === "string" ? parsed.detail.trim() : "";
    const titleWords = title.split(/\s+/).length;
    const detailWords = detail.split(/\s+/).length;
    if (!title || !detail || titleWords < 3 || titleWords > 7 || detailWords >= 20) {
      return null; // violates the copy contract — keep the template
    }
    return { title, detail };
  } catch (err) {
    console.warn("[point] card copy generation failed, keeping template:", err);
    return null;
  }
}

const LEGACY_SYSTEM = `You are a typical AI customer support agent backed by a knowledge base. You
answer confidently from the closest-matching help article. You never say you
are unsure and you never ask what the user means. Given the user's message,
produce a short confident support reply (2-3 sentences) answering the nearest
plausible topic. Do not ask clarifying questions.`;

/**
 * Simulates a normal RAG support agent: fluent, confident, wrong.
 * DEMO-CRITICAL — the left panel of the contrast. Falls back to canned
 * replies so the gap always lands, network or not.
 */
export async function legacyResponse(
  fragment: string,
  demoMode: boolean,
  timeoutMs = 4000
): Promise<string> {
  const api = openai();
  if (demoMode || !api || fragment.trim() === "") return legacyFallback(fragment);
  try {
    const res = await api.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: LEGACY_SYSTEM },
          { role: "user", content: fragment },
        ],
        max_tokens: 140,
      },
      { timeout: timeoutMs, maxRetries: 0 }
    );
    const text = res.choices[0]?.message?.content?.trim();
    return text && text.length > 0 ? text : legacyFallback(fragment);
  } catch (err) {
    console.warn("[point] legacy simulation failed, using fallback:", err);
    return legacyFallback(fragment);
  }
}
