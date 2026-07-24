import type { Candidate, Hypothesis, MatchSource } from "./types";
import {
  PRECOMPUTED,
  embedHypothesisDocs,
  embedTexts,
  normalizeFragment,
  octenConfigured,
  similarity,
} from "./octen";

// Scoring, per the locked formula:
//   finalScore = baseScore + recencyBoost + 0.4 × semanticSimilarity
// recencyBoost: 0.5 within 72h, 0.25 within 7d, else 0.
// Top 3, never more — three is a cognitive-load constraint, not a default.

const SEMANTIC_WEIGHT = 0.4;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function recencyBoost(occurredAt: Date): number {
  const age = Date.now() - occurredAt.getTime();
  // Strict inequalities: fixtures are rebuilt per call, so an anomaly pinned
  // at exactly -72h must land on the same side of the boundary every run.
  if (age < 72 * HOUR) return 0.5;
  if (age < 7 * DAY) return 0.25;
  return 0;
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "it", "my", "me", "i", "of", "to", "and", "for",
  "in", "on", "was", "this", "that", "with", "help", "please",
]);

/**
 * The last rung of the fallback ladder: token overlap between the fragment
 * and the hypothesis bag (title + detail + variants). Exists so arbitrary
 * judge input always scores something and never crashes.
 */
export function keywordSimilarity(fragment: string, h: Hypothesis): number {
  const fragTokens = normalizeFragment(fragment)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  if (fragTokens.length === 0) return 0;

  const bag = normalizeFragment(
    [h.title, h.detail, ...h.variants].join(" ")
  ).split(" ");
  const bagSet = new Set(bag.filter((t) => !STOPWORDS.has(t)));

  let hits = 0;
  for (const t of fragTokens) {
    if (bagSet.has(t)) {
      hits += 1;
    } else {
      // partial credit for stem-ish overlap ("charged" ~ "charge")
      let partial = false;
      for (const b of bagSet) {
        if (
          (t.length >= 4 && b.startsWith(t.slice(0, 4))) ||
          (b.length >= 4 && t.startsWith(b.slice(0, 4)))
        ) {
          partial = true;
          break;
        }
      }
      if (partial) hits += 0.5;
    }
  }
  return Math.min(1, hits / Math.min(4, fragTokens.length));
}

async function semanticScores(
  fragment: string,
  hypotheses: Hypothesis[],
  demoMode: boolean
): Promise<{ scores: Map<string, number>; source: MatchSource }> {
  const scores = new Map<string, number>();
  const normalized = normalizeFragment(fragment);

  // Zero-word path: ranked on account state and recency alone.
  if (normalized === "") {
    for (const h of hypotheses) scores.set(h.id, 0);
    return { scores, source: "none" };
  }

  // Rung 1 — the precomputed table for the golden-path fragments. It applies
  // in live mode too: it IS the locked tuning (III.6 "tune and lock"), so the
  // stage paths are deterministic regardless of what live cosines drift to.
  // Octen still runs live for every other fragment.
  const locked = PRECOMPUTED[normalized];
  if (locked) {
    for (const h of hypotheses) scores.set(h.id, locked[h.kind] ?? 0);
    return { scores, source: "precomputed" };
  }

  // Rung 2 — live Octen embeddings (only outside demo mode, only if configured).
  if (!demoMode && octenConfigured()) {
    try {
      const docs = hypotheses.map((h) => ({
        key: h.id + "::" + h.title,
        text: [h.title, ...h.variants].join(". "),
      }));
      const [docVectors, [queryVector]] = await Promise.all([
        embedHypothesisDocs(docs),
        embedTexts([normalized], "query"),
      ]);
      let complete = true;
      for (let i = 0; i < hypotheses.length; i++) {
        const v = docVectors.get(docs[i].key);
        if (!v) {
          complete = false;
          break;
        }
        scores.set(hypotheses[i].id, similarity(queryVector, v));
      }
      if (complete) return { scores, source: "octen" };
    } catch (err) {
      console.warn("[point] Octen unavailable, falling back:", err);
    }
  }

  // Rung 3 — keyword overlap for everything else.
  for (const h of hypotheses) scores.set(h.id, keywordSimilarity(fragment, h));
  return { scores, source: "keyword" };
}

export async function rank(
  hypotheses: Hypothesis[],
  fragment: string,
  demoMode: boolean
): Promise<{ candidates: Candidate[]; matchedBy: MatchSource }> {
  const { scores, source } = await semanticScores(fragment, hypotheses, demoMode);

  const candidates = hypotheses
    .map((h) => {
      const semantic = scores.get(h.id) ?? 0;
      const recency = recencyBoost(h.occurredAt);
      return {
        id: h.id,
        kind: h.kind,
        title: h.title,
        detail: h.detail,
        evidence: h.evidence,
        occurredAt: h.occurredAt.toISOString(),
        finalScore: h.baseScore + recency + SEMANTIC_WEIGHT * semantic,
        scores: { base: h.baseScore, recency, semantic },
        action: h.action,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 3); // never more than three

  return { candidates, matchedBy: source };
}
