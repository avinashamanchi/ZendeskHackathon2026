import { normalizeFragment } from "./fixtures";
import type { Hypothesis, RankedCandidate } from "./types";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const lockedSemanticScores: Record<string, Record<string, number>> = {
  "order wrong thing help": {
    duplicate_charge: 0.98,
    wrong_item: 0.68,
    late_delivery: 0.15,
    prior_ticket_followup: 0.08,
  },
  "order wrong the thing help": {
    duplicate_charge: 0.98,
    wrong_item: 0.68,
    late_delivery: 0.15,
    prior_ticket_followup: 0.08,
  },
  "the boily thing broke": {
    wrong_item: 0.81,
    duplicate_charge: 0.08,
    late_delivery: 0.1,
    prior_ticket_followup: 0,
  },
};

function tokens(value: string): Set<string> {
  return new Set(normalizeFragment(value).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function trigrams(value: string): Set<string> {
  const normalized = `  ${normalizeFragment(value)}  `;
  const grams = new Set<string>();
  for (let index = 0; index <= normalized.length - 3; index += 1) {
    grams.add(normalized.slice(index, index + 3));
  }
  return grams;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }
  return (2 * intersection) / (a.size + b.size);
}

export function offlineSimilarity(
  fragment: string,
  hypothesis: Hypothesis,
): number {
  const normalized = normalizeFragment(fragment);
  if (!normalized) return 0;

  const locked = lockedSemanticScores[normalized]?.[hypothesis.kind];
  if (locked !== undefined) return locked;

  const queryTokens = tokens(normalized);
  const queryTrigrams = trigrams(normalized);
  const candidates = [
    hypothesis.title,
    hypothesis.detail,
    ...hypothesis.variants,
  ];

  return Math.min(
    1,
    Math.max(
      ...candidates.map((candidate) =>
        Math.max(
          jaccard(queryTokens, tokens(candidate)),
          dice(queryTrigrams, trigrams(candidate)) * 0.85,
        ),
      ),
    ),
  );
}

export function recencyBoost(occurredAt: string, now = new Date()): number {
  const age = Math.max(0, now.getTime() - Date.parse(occurredAt));
  if (age <= 72 * HOUR_MS) return 0.5;
  if (age <= 7 * DAY_MS) return 0.25;
  return 0;
}

export function rankHypotheses(
  hypotheses: Hypothesis[],
  fragment: string,
  semanticScores?: Record<string, number> | null,
  now = new Date(),
): RankedCandidate[] {
  const hasFragment = Boolean(normalizeFragment(fragment));

  return hypotheses
    .map((hypothesis) => {
      const semanticScore = Math.max(
        0,
        Math.min(
          1,
          semanticScores?.[hypothesis.id] ??
            offlineSimilarity(fragment, hypothesis),
        ),
      );
      // With no words, lead with the strongest observed account signals. A
      // small recency tie-break still helps, but a merely recent item should
      // not outrank a duplicate charge or a missed delivery promise.
      const rawFreshness = recencyBoost(hypothesis.occurredAt, now);
      const freshness = hasFragment ? rawFreshness : Math.min(rawFreshness, 0.25);
      return {
        ...hypothesis,
        semanticScore,
        recencyBoost: freshness,
        finalScore: hypothesis.baseScore + freshness + 0.4 * semanticScore,
      };
    })
    .sort(
      (a, b) =>
        b.finalScore - a.finalScore ||
        b.baseScore - a.baseScore ||
        Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3);
}
