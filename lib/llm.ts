import { z } from "zod";
import {
  isLockedDemoFragment,
  LEGACY_GOLDEN_RESPONSE,
} from "./fixtures";
import type { Hypothesis, ProviderSource } from "./types";

const CardCopySchema = z.object({
  cards: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      detail: z.string(),
    }),
  ),
});

export interface GeneratedValue<T> {
  value: T;
  source: ProviderSource;
}

async function openAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const { default: OpenAI } = await import("openai");
  return new OpenAI({ apiKey });
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isValidCopy(title: string, detail: string): boolean {
  const titleWords = countWords(title);
  const detailWords = countWords(detail);
  return (
    titleWords >= 3 &&
    titleWords <= 7 &&
    detailWords > 0 &&
    detailWords < 20 &&
    !/[?]/.test(title) &&
    !/\b(issue|concern|regarding|we apologise|it appears)\b/i.test(
      `${title} ${detail}`,
    )
  );
}

export async function generateCardCopy(
  hypotheses: Hypothesis[],
  fragment: string,
  demoMode: boolean,
  timeoutMs = 900,
): Promise<GeneratedValue<Map<string, { title: string; detail: string }>>> {
  const fallback = new Map(
    hypotheses.map((hypothesis) => [
      hypothesis.id,
      { title: hypothesis.title, detail: hypothesis.detail },
    ]),
  );

  if (demoMode || isLockedDemoFragment(fragment) || hypotheses.length === 0) {
    return { value: fallback, source: "fixture" };
  }

  try {
    const [client, { zodTextFormat }] = await Promise.all([
      openAIClient(),
      import("openai/helpers/zod"),
    ]);
    const response = await client.responses.parse(
      {
        model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
        reasoning: { effort: "none" },
        instructions: `You write interface copy for people with expressive aphasia. They understand what they read but may not be able to retrieve words.

Rewrite each supplied candidate without changing any fact.
- Title: 3 to 7 words, sentence case, second person when natural, no question mark.
- Detail: exactly one sentence, under 20 words, with the supplied number, date, order, or item.
- Use concrete everyday words and active voice.
- Never use: issue, concern, regarding, we apologise, it appears.
- Never add a fact and never remove the candidate id.`,
        input: JSON.stringify(
          hypotheses.map(({ id, title, detail }) => ({ id, title, detail })),
        ),
        text: { format: zodTextFormat(CardCopySchema, "wordless_card_copy") },
        max_output_tokens: 600,
      },
      { signal: AbortSignal.timeout(timeoutMs) },
    );

    const parsed = response.output_parsed;
    if (!parsed || parsed.cards.length !== hypotheses.length) {
      throw new Error("OpenAI returned an incomplete card set.");
    }

    const generated = new Map<string, { title: string; detail: string }>();
    for (const card of parsed.cards) {
      if (!fallback.has(card.id) || !isValidCopy(card.title, card.detail)) {
        throw new Error("OpenAI returned copy outside the accessibility contract.");
      }
      generated.set(card.id, { title: card.title, detail: card.detail });
    }

    if (generated.size !== fallback.size) {
      throw new Error("OpenAI changed a candidate id.");
    }
    return { value: generated, source: "live" };
  } catch (error) {
    console.info("[Wordless] OpenAI card copy fallback", error);
    return { value: fallback, source: "fallback" };
  }
}

export async function legacyResponse(
  fragment: string,
  demoMode: boolean,
  timeoutMs = 900,
): Promise<GeneratedValue<string>> {
  if (demoMode || isLockedDemoFragment(fragment)) {
    return { value: LEGACY_GOLDEN_RESPONSE, source: "fixture" };
  }

  try {
    const client = await openAIClient();
    const response = await client.responses.create(
      {
        model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
        reasoning: { effort: "none" },
        instructions:
          "You are a typical knowledge-base customer support agent. Answer confidently from the closest plausible help article. Never say you are unsure and never ask a clarifying question. Write 2–3 short sentences.",
        input: fragment || "I need help.",
        max_output_tokens: 180,
      },
      { signal: AbortSignal.timeout(timeoutMs) },
    );

    const value = response.output_text.trim();
    if (!value) throw new Error("OpenAI returned empty legacy copy.");
    return { value, source: "live" };
  } catch (error) {
    console.info("[Wordless] OpenAI legacy fallback", error);
    return { value: LEGACY_GOLDEN_RESPONSE, source: "fallback" };
  }
}
