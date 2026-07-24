import { NextResponse } from "next/server";
import type { Candidate, ResolveResponse } from "@/lib/types";
import { fixtureFor } from "@/lib/fixtures";
import { hypothesesFor } from "@/lib/engine";
import { rank } from "@/lib/rank";
import { getAccountState } from "@/lib/composio";
import { generateCardCopy, legacyResponse } from "@/lib/llm";
import { legacyFallback } from "@/lib/legacy-fallback";

// POST { fragment, email, demo } → ranked candidates + the legacy reply.
// This route can not 500: any failure collapses to a fixture-computed
// response. Keys stay on this side of the wire.

export const runtime = "nodejs";

const ENV_DEMO_DEFAULT = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

async function polishCards(candidates: Candidate[], demoMode: boolean): Promise<Candidate[]> {
  if (demoMode || !process.env.OPENAI_API_KEY) return candidates;
  // Copy polish is best-effort and per-card: a null (timeout, bad JSON,
  // rule violation) keeps the deterministic template copy.
  const polished = await Promise.all(
    candidates.map((c) =>
      generateCardCopy(
        { kind: c.kind, title: c.title, detail: c.detail, evidence: c.evidence },
        1200
      )
    )
  );
  return candidates.map((c, i) =>
    polished[i] ? { ...c, title: polished[i]!.title, detail: polished[i]!.detail } : c
  );
}

export async function POST(request: Request) {
  let fragment = "";
  let email = "maria@example.com";
  let demoMode = ENV_DEMO_DEFAULT;
  try {
    const body = await request.json();
    if (typeof body.fragment === "string") fragment = body.fragment.slice(0, 500);
    if (typeof body.email === "string") email = body.email;
    if (typeof body.demo === "boolean") demoMode = body.demo;
  } catch {
    // malformed body → defaults; the demo still answers
  }

  try {
    const { state } = await getAccountState(email, demoMode);
    const hypotheses = hypothesesFor(state);
    const [{ candidates, matchedBy }, legacy] = await Promise.all([
      rank(hypotheses, fragment, demoMode),
      legacyResponse(fragment, demoMode, 1500),
    ]);
    const response: ResolveResponse = {
      candidates: await polishCards(candidates, demoMode),
      legacy,
      matchedBy,
      customer: { email: state.email, name: state.name },
    };
    return NextResponse.json(response);
  } catch (err) {
    console.warn("[point] resolve fell back to pure fixtures:", err);
    const state = fixtureFor(email);
    const { candidates, matchedBy } = await rank(hypothesesFor(state), fragment, true);
    const response: ResolveResponse = {
      candidates,
      legacy: legacyFallback(fragment),
      matchedBy,
      customer: { email: state.email, name: state.name },
    };
    return NextResponse.json(response);
  }
}
