import type {
  AccountState,
  Candidate,
  Gate,
  Hypothesis,
  MatchSource,
  PipelineEvent,
  TimedEvent,
} from "./types";
import { evidenceDate, money, shortDate } from "./format";
import { keywordSimilarity } from "./rank";
import { PRECOMPUTED, normalizeFragment } from "./octen";
import { buildScript, pathFor, recordCounts, type TokenMatch } from "./reasoning";

// Assembles the full, timed event list for one resolve. Client-safe: no SDK
// imports. The server streams these over SSE; the client scheduler dispatches
// them by `at` (auto) or by `gate` (presenter). In DEMO_MODE every latency is
// simulated (§10.2) and marked `sim` — never claim a real API call that
// didn't happen.

export interface PipelineInput {
  state: AccountState;
  fragment: string;
  candidates: Candidate[];
  hypotheses: Hypothesis[];
  legacy: string;
  matchedBy: MatchSource;
  sim: boolean;
  /** measured live latencies, ms — only present when the call really ran */
  latency?: Partial<Record<"composio" | "octen" | "codex", number>>;
  composioFromCache?: boolean;
  octenFromCache?: boolean;
}

/** §10.2 simulated latency, ±15% jitter so repeat runs don't look canned. */
function simLatency(lo: number, hi: number): number {
  const base = lo + Math.random() * (hi - lo);
  const jitter = 1 + (Math.random() * 0.3 - 0.15);
  return Math.round(base * jitter);
}

/** The never-empty-screen card (§16): zero hypotheses → talk to a person. */
export function humanHandoffCard(fragment: string): Candidate {
  return {
    id: "human_handoff",
    kind: "human_handoff",
    title: "Talk to a person",
    detail: "Your message goes to a human with your account already attached.",
    evidence: [
      fragment.trim() ? `Your words: "${fragment.trim().slice(0, 120)}"` : "No message needed",
      "A person sees your orders and charges immediately",
    ],
    occurredAt: new Date().toISOString(),
    finalScore: 0,
    scores: { base: 0, recency: 0, semantic: 0 },
    action: {
      kind: "file_ticket",
      summary: fragment.trim()
        ? `Customer message (needs human review): "${fragment.trim().slice(0, 200)}"`
        : "Customer asked for help without a message; account state attached.",
    },
  };
}

function tokenMatches(
  path: ReturnType<typeof pathFor>,
  fragment: string,
  state: AccountState,
  hypotheses: Hypothesis[]
): TokenMatch[] {
  const kettle = state.orders[0];
  const itemName = kettle?.items[0]?.name.split(",")[0].toLowerCase() ?? "item";
  if (path === "A") {
    const table = PRECOMPUTED["order wrong the thing help"];
    return [
      { token: "the thing", target: `${itemName} · ${kettle?.id ?? ""}`, keyword: 0, octen: table.wrong_item },
      { token: "wrong", target: "arrived damaged", keyword: 0.5, octen: 0.55 },
      { token: "help", target: "—", keyword: 0, octen: 0.08 },
    ];
  }
  if (path === "B") {
    const table = PRECOMPUTED["the boily thing broke"];
    const target: Record<string, string> = {
      wrong_item: `${itemName} · ${kettle?.id ?? ""}`,
      duplicate_charge: "a double charge",
      late_delivery: "a late order",
      refund_pending: "a missing refund",
      unexpected_renewal: "a renewal",
    };
    return Object.keys(target).map((kind) => ({
      token: "boily thing",
      target: target[kind],
      keyword: 0,
      octen: table[kind] ?? 0,
    }));
  }
  if (path === "C") return [];
  // judge input: real keyword-rung scores; octen −1 = not measured (shown "—")
  return hypotheses.slice(0, 5).map((h) => ({
    token: fragment.trim().split(/\s+/).slice(0, 3).join(" "),
    target: h.title,
    keyword: Math.round(keywordSimilarity(fragment, h) * 100) / 100,
    octen: -1,
  }));
}

const NOT_FIRED_WHY: Record<string, (s: AccountState) => string> = {
  duplicate_charge: () => "no matching charges",
  wrong_item: () => "nothing delivered recently",
  late_delivery: () => "nothing overdue",
  refund_pending: (s) => (s.refunds.length === 0 ? "no refunds on file" : "refund already settled"),
  unexpected_renewal: () => "no subscriptions",
};

export function buildPipelineEvents(input: PipelineInput): TimedEvent[] {
  const { state, fragment, hypotheses, legacy, sim } = input;
  const candidates =
    input.candidates.length > 0 ? input.candidates : [humanHandoffCard(fragment)];
  const path = pathFor(normalizeFragment(fragment));
  const tokens = tokenMatches(path, fragment, state, hypotheses);
  const { n, m } = recordCounts(state);

  // Per-tool honesty: a chip only drops its `sim` marker when that call was
  // genuinely made and measured.
  const composioSim = input.latency?.composio == null;
  const octenSim = input.latency?.octen == null;
  const codexSim = input.latency?.codex == null;
  const composioMs = input.latency?.composio ?? simLatency(180, 320);
  const octenMs = input.latency?.octen ?? simLatency(60, 95);
  const codexMs = input.latency?.codex ?? simLatency(400, 700);

  // Section anchors, ms from submit (§12.10). Path C compresses — there is
  // no fragment to read, so the pipeline gets to the point sooner.
  const A = path === "C"
    ? { composio: 0, found: 2600, legacy: 3000, octen: 4000, scoring: 5000, cards: 6600, done: 8000 }
    : { composio: 0, found: 2800, legacy: 5400, octen: 6000, scoring: 8600, cards: 11000, done: 13600 };

  const out: TimedEvent[] = [];
  const ev = (at: number, gate: Gate, e: PipelineEvent) =>
    out.push({ ...e, at, gate });

  // --- composio gate: account reads + evidence -----------------------------
  ev(A.composio, "composio", {
    t: "stage_start",
    tool: "composio",
    label: input.composioFromCache ? "reading cache" : "reading stripe",
  });

  // reasoning items, assigned to their sections' gates
  const script = buildScript({
    path,
    state,
    fragment,
    candidates,
    tokens,
    composioFromCache: Boolean(input.composioFromCache),
  });
  let section: Gate = "composio";
  let cursor = A.composio + 200;
  for (const item of script) {
    if (item.kind === "head") {
      if (item.text.includes("what I found")) cursor = A.found;
      else if (item.text.includes("fragment")) {
        section = "octen";
        cursor = A.octen;
      } else if (item.text.includes("deciding")) {
        section = "scoring";
        cursor = A.scoring;
      } else if (item.text.includes("choices")) {
        section = "cards";
        cursor = A.cards;
      }
      ev(cursor, section, { t: "reason_head", text: item.text });
    } else {
      ev(cursor, section, { t: "reason_line", text: item.text });
    }
    cursor += 380;
  }

  // evidence rows, ~90ms apart, starting at 1400
  const dupIds = new Set(
    hypotheses
      .filter((h) => h.kind === "duplicate_charge")
      .flatMap((h) => [h.action.chargeId ?? "", ...h.evidence.map((e) => e.split(" ")[1] ?? "")])
  );
  const hitOrders = new Set(
    hypotheses
      .filter((h) => h.kind === "wrong_item" || h.kind === "late_delivery")
      .map((h) => h.action.orderId ?? "")
  );
  let evAt = A.composio + 1400;
  const push = (source: string, line: string, raw: object, hit: boolean) => {
    ev(evAt, "composio", { t: "evidence", source, line, raw, hit });
    evAt += 90;
  };
  for (const c of state.charges) {
    push("stripe", `${c.id}  ${money(c.amount)}  ${c.status}  ${evidenceDate(c.createdAt)}`, c, dupIds.has(c.id));
  }
  for (const o of state.orders) {
    const item = o.items[0]?.name ?? "";
    push("orders", `${o.id}  ${o.status}${o.deliveredAt ? " " + shortDate(o.deliveredAt) : ""} · ${item}`, o, hitOrders.has(o.id));
  }
  for (const s of state.subscriptions) {
    push("stripe", `${s.id}  ${s.planName} · renewed ${shortDate(s.renewedAt)}`, s, hypotheses.some((h) => h.action.subscriptionId === s.id));
  }
  for (const r of state.refunds) {
    push("stripe", `${r.id}  ${money(r.amount)}  ${r.settledAt ? "settled" : "pending"}`, r, hypotheses.some((h) => h.action.refundId === r.id));
  }
  for (const tkt of state.priorTickets) {
    push("zendesk", `#${tkt.id}  ${tkt.status} · "${tkt.subject}"`, tkt, false);
  }

  ev(A.composio + 2600, "composio", {
    t: "stage_done",
    tool: "composio",
    ms: composioMs,
    sim: composioSim,
    summary: `${n} records · ${m} sources`,
  });

  // --- octen gate: legacy reply + semantic comparisons ---------------------
  ev(A.legacy, "octen", { t: "legacy", text: legacy });
  if (path === "C") {
    ev(A.octen, "octen", { t: "stage_skipped", tool: "octen", label: "no words" });
  } else if (!sim && input.octenFromCache) {
    // Live mode, octen unreachable or bypassed → §16: chip shows `fixtures`.
    ev(A.octen, "octen", { t: "stage_skipped", tool: "octen", label: "fixtures" });
    tokens.forEach((tk, i) =>
      ev(A.octen + 400 + i * 350, "octen", {
        t: "semantic",
        token: tk.token,
        target: tk.target,
        keyword: tk.keyword,
        octen: tk.octen,
      })
    );
  } else {
    ev(A.octen, "octen", { t: "stage_start", tool: "octen", label: "embedding fragment" });
    tokens.forEach((tk, i) =>
      ev(A.octen + 400 + i * 350, "octen", {
        t: "semantic",
        token: tk.token,
        target: tk.target,
        keyword: tk.keyword,
        octen: tk.octen,
      })
    );
    ev(A.octen + 2200, "octen", {
      t: "stage_done",
      tool: "octen",
      ms: octenMs,
      sim: octenSim,
      summary: `${Math.max(tokens.length, 1)} comparisons`,
    });
  }

  // --- scoring gate: every hypothesis, fired or not ------------------------
  const firedByKind = new Map(candidates.map((c, i) => [c.kind, { c, rank: i + 1 }]));
  const KINDS = ["duplicate_charge", "wrong_item", "late_delivery", "refund_pending", "unexpected_renewal"];
  let scoreAt = A.scoring + 100;
  for (const kind of KINDS) {
    const fired = firedByKind.get(kind);
    if (fired) {
      ev(scoreAt, "scoring", {
        t: "hypothesis",
        kind,
        base: fired.c.scores.base,
        recency: fired.c.scores.recency,
        semantic: Math.round(fired.c.scores.semantic * 0.4 * 100) / 100,
        total: Math.round(fired.c.finalScore * 100) / 100,
        fired: true,
        rank: fired.rank,
        why: "",
      });
    } else {
      const generated = hypotheses.find((h) => h.kind === kind);
      ev(scoreAt, "scoring", {
        t: "hypothesis",
        kind,
        base: 0,
        recency: 0,
        semantic: 0,
        total: 0,
        fired: false,
        why: generated ? "outranked" : NOT_FIRED_WHY[kind]?.(state) ?? "no signal",
      });
    }
    scoreAt += 180;
  }

  // --- cards gate: codex writes the choices --------------------------------
  ev(A.cards, "cards", { t: "stage_start", tool: "codex", label: "writing card copy" });
  ev(A.cards + 1200, "cards", {
    t: "candidates",
    cards: candidates,
    panel: path === "B" ? "compare" : "scores",
    customer: { email: state.email, name: state.name },
  });
  ev(A.done, "cards", {
    t: "stage_done",
    tool: "codex",
    ms: codexMs,
    sim: codexSim,
    summary: `${candidates.length} cards`,
  });

  return out.sort((a, b) => a.at - b.at);
}
