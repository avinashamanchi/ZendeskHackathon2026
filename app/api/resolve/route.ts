import type { Candidate, TimedEvent } from "@/lib/types";
import { fixtureFor } from "@/lib/fixtures";
import { hypothesesFor } from "@/lib/engine";
import { rank } from "@/lib/rank";
import { getAccountState } from "@/lib/composio";
import { generateCardCopy, legacyResponse } from "@/lib/llm";
import { legacyFallback } from "@/lib/legacy-fallback";
import { buildPipelineEvents } from "@/lib/pipeline";

// POST { fragment, email, demo } → SSE stream of TimedEvents.
// The engine surface eats these; the customer surface eats the `candidates`
// event inside them. This route can not 500: any failure collapses to the
// fixture-computed event list. Keys stay on this side of the wire.

export const runtime = "nodejs";

const ENV_DEMO_DEFAULT = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

async function polishCards(candidates: Candidate[], demoMode: boolean): Promise<Candidate[]> {
  if (demoMode || !process.env.OPENAI_API_KEY) return candidates;
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

async function computeEvents(
  fragment: string,
  email: string,
  demoMode: boolean
): Promise<TimedEvent[]> {
  const t0 = Date.now();
  const { state, source } = await getAccountState(email, demoMode);
  const composioMs = Date.now() - t0;

  const hypotheses = hypothesesFor(state);

  const t1 = Date.now();
  const [{ candidates, matchedBy }, legacy] = await Promise.all([
    rank(hypotheses, fragment, demoMode),
    legacyResponse(fragment, demoMode, 1500),
  ]);
  const octenMs = Date.now() - t1;

  const t2 = Date.now();
  const cards = await polishCards(candidates, demoMode);
  const codexMs = Date.now() - t2;

  const live = !demoMode && source === "live";
  return buildPipelineEvents({
    state,
    fragment,
    candidates: cards,
    hypotheses,
    legacy,
    matchedBy,
    sim: !live,
    latency: live
      ? {
          composio: composioMs,
          octen: matchedBy === "octen" ? octenMs : undefined,
          codex: codexMs > 5 ? codexMs : undefined,
        }
      : undefined,
    composioFromCache: !demoMode && source === "fixture",
    octenFromCache: !demoMode && matchedBy !== "octen",
  });
}

export async function POST(request: Request) {
  let fragment = "";
  let email = "maria@example.com";
  let demoMode = ENV_DEMO_DEFAULT;
  try {
    const body = await request.json();
    if (typeof body.fragment === "string") fragment = body.fragment.slice(0, 500);
    if (typeof body.email === "string") email = body.email.slice(0, 200);
    if (typeof body.demo === "boolean") demoMode = body.demo;
  } catch {
    // malformed body → defaults; the demo still answers
  }

  let events: TimedEvent[];
  try {
    events = await computeEvents(fragment, email, demoMode);
  } catch (err) {
    console.warn("[wordless] resolve fell back to pure fixtures:", err);
    const state = fixtureFor(email);
    const hypotheses = hypothesesFor(state);
    const { candidates, matchedBy } = await rank(hypotheses, fragment, true);
    events = buildPipelineEvents({
      state,
      fragment,
      candidates,
      hypotheses,
      legacy: legacyFallback(fragment),
      matchedBy,
      sim: true,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const e of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: {"t":"end"}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
