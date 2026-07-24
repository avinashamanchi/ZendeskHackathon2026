import { signActionToken } from "./action-token";
import { getAccountState } from "./composio";
import { isLockedDemoFragment, normalizeFragment } from "./fixtures";
import { generateHypotheses } from "./hypotheses.generated";
import { generateCardCopy, legacyResponse } from "./llm";
import { getOctenSimilarityScores } from "./octen";
import { offlineSimilarity, rankHypotheses, recencyBoost } from "./rank";
import {
  accountFindingsReasoning,
  accountOpeningReasoning,
  decisionReasoning,
  fragmentReasoning,
  writingReasoning,
  type ReasoningContext,
} from "./reasoning";
import { liveIntegrationsAllowed } from "./runtime";
import type {
  AccountState,
  CandidateView,
  Hypothesis,
  PipelineEvent,
  PipelineStageState,
  PipelineTool,
  ProviderSource,
  ResolveResponse,
} from "./types";

export interface ResolutionPipelineInput {
  email: string;
  fragment: string;
  requestedDemoMode: boolean;
  signal?: AbortSignal;
}

const CORE_RULES = [
  {
    kind: "duplicate_charge",
    base: 0.9,
    absent: "fewer than two matching successful charges",
  },
  {
    kind: "wrong_item",
    base: 0.7,
    absent: "no delivery within the last 14 days",
  },
  {
    kind: "late_delivery",
    base: 0.8,
    absent: "nothing is past its promised date",
  },
  {
    kind: "unexpected_renewal",
    base: 0.6,
    absent: "no active renewal within the last 7 days",
  },
  {
    kind: "refund_pending",
    base: 0.75,
    absent: "no unsettled refund older than 5 days",
  },
] as const;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

function deterministicLatency(
  tool: "composio" | "octen" | "codex",
  email: string,
  fragment: string,
): number {
  const ranges = {
    composio: [180, 320],
    octen: [60, 95],
    codex: [400, 700],
  } as const;
  let hash = 2_166_136_261;
  const value = `${tool}:${email}:${normalizeFragment(fragment)}`;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  const [minimum, maximum] = ranges[tool];
  return minimum + ((hash >>> 0) % (maximum - minimum + 1));
}

function stageState(source: ProviderSource): Exclude<
  PipelineStageState,
  "running"
> {
  if (source === "fixture") return "fixtures";
  if (source === "fallback") return "fallback";
  if (source === "skipped") return "skipped";
  return "done";
}

function stageStart(
  tool: PipelineTool,
  label: string,
  source: ProviderSource,
  simulated: boolean,
): PipelineEvent {
  return {
    t: "stage_start",
    tool,
    label,
    source,
    state: "running",
    simulated,
  };
}

function stageDone(
  tool: PipelineTool,
  ms: number,
  summary: string,
  source: ProviderSource,
  simulated: boolean,
): PipelineEvent {
  return {
    t: "stage_done",
    tool,
    ms,
    summary,
    source,
    state: stageState(source),
    simulated,
  };
}

function recovered(tool: PipelineTool): PipelineEvent {
  return {
    t: "error",
    tool,
    recovered: true,
    source: "fallback",
    state: "fallback",
  };
}

function ensureActive(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("The resolution stream was cancelled.", "AbortError");
  }
}

function recordHit(id: string, hypotheses: Hypothesis[]): boolean {
  return hypotheses.some(
    (hypothesis) =>
      hypothesis.id.includes(id) ||
      hypothesis.evidence.some((evidence) => evidence.includes(id)),
  );
}

function evidenceEvents(
  state: AccountState,
  hypotheses: Hypothesis[],
): Array<Extract<PipelineEvent, { t: "evidence" }>> {
  const events: Array<Extract<PipelineEvent, { t: "evidence" }>> = [];

  for (const charge of state.charges) {
    events.push({
      t: "evidence",
      source: "stripe",
      line: `${charge.id} · ${money(charge.amount)} · ${charge.status} · ${dateTime(charge.createdAt)}`,
      raw: { ...charge },
      hit: recordHit(charge.id, hypotheses),
    });
  }

  for (const order of state.orders) {
    const eventDate =
      order.deliveredAt ?? order.promisedBy ?? order.lastTrackingAt ?? order.placedAt;
    events.push({
      t: "evidence",
      source: "orders",
      line: `${order.id} · ${order.status.replaceAll("_", " ")} · ${dateTime(eventDate)} · ${order.items[0]?.name ?? "item"}`,
      raw: { ...order, items: order.items.map((item) => ({ ...item })) },
      hit: recordHit(order.id, hypotheses),
    });
  }

  for (const ticket of state.priorTickets) {
    events.push({
      t: "evidence",
      source: "zendesk",
      line: `#${ticket.id} · ${ticket.status} · “${ticket.subject}” · ${dateTime(ticket.createdAt)}`,
      raw: { ...ticket },
      hit: recordHit(String(ticket.id), hypotheses),
    });
  }

  for (const subscription of state.subscriptions) {
    events.push({
      t: "evidence",
      source: "stripe",
      line: `${subscription.id} · ${subscription.planName} · ${money(subscription.amount)} · ${subscription.status}`,
      raw: { ...subscription },
      hit: recordHit(subscription.id, hypotheses),
    });
  }

  for (const refund of state.refunds) {
    events.push({
      t: "evidence",
      source: "stripe",
      line: `${refund.id} · ${money(refund.amount)} · ${refund.status} · ${dateTime(refund.initiatedAt)}`,
      raw: { ...refund },
      hit: recordHit(refund.id, hypotheses),
    });
  }

  return events;
}

function wordTokens(value: string): Set<string> {
  return new Set(normalizeFragment(value).split(" ").filter(Boolean));
}

function keywordSimilarity(fragment: string, hypothesis: Hypothesis): number {
  const query = wordTokens(fragment);
  if (query.size === 0) return 0;
  const target = wordTokens(`${hypothesis.title} ${hypothesis.detail}`);
  let matches = 0;
  for (const token of query) {
    if (target.has(token)) matches += 1;
  }
  return matches / query.size;
}

function fixtureSemanticScore(
  fragment: string,
  hypothesis: Hypothesis,
): number {
  if (normalizeFragment(fragment) === "the boily thing broke") {
    if (hypothesis.kind === "wrong_item") return 0.81;
    if (hypothesis.kind === "duplicate_charge") return 0.08;
    if (hypothesis.kind === "late_delivery") return 0.1;
  }
  return offlineSimilarity(fragment, hypothesis);
}

function semanticEvents(
  fragment: string,
  hypotheses: Hypothesis[],
  semanticScores: Record<string, number>,
  keywordScores: Record<string, number>,
): Array<Extract<PipelineEvent, { t: "semantic" }>> {
  const events = hypotheses.map((hypothesis) => ({
    t: "semantic" as const,
    token:
      normalizeFragment(fragment) === "the boily thing broke"
        ? "boily thing"
        : normalizeFragment(fragment),
    target: hypothesis.kind,
    keyword: round(keywordScores[hypothesis.id] ?? 0),
    octen: round(semanticScores[hypothesis.id] ?? 0),
  }));

  const presentKinds = new Set(hypotheses.map((hypothesis) => hypothesis.kind));
  for (const rule of CORE_RULES) {
    if (!presentKinds.has(rule.kind)) {
      const normalized = normalizeFragment(fragment);
      const lockedMissingScores: Record<string, Record<string, number>> = {
        "order wrong thing help": { late_delivery: 0.15 },
        "order wrong the thing help": { late_delivery: 0.15 },
        "the boily thing broke": {
          late_delivery: 0.1,
          unexpected_renewal: 0.02,
          refund_pending: 0.03,
        },
      };
      events.push({
        t: "semantic",
        token:
          normalizeFragment(fragment) === "the boily thing broke"
            ? "boily thing"
            : normalizeFragment(fragment),
        target: rule.kind,
        keyword: 0,
        octen: lockedMissingScores[normalized]?.[rule.kind] ?? 0,
      });
    }
  }
  return events;
}

function hypothesisEvents(
  fragment: string,
  hypotheses: Hypothesis[],
  semanticScores: Record<string, number>,
  now: Date,
): Array<Extract<PipelineEvent, { t: "hypothesis" }>> {
  const hasWords = Boolean(normalizeFragment(fragment));
  const emitted = new Set<string>();
  const events: Array<Extract<PipelineEvent, { t: "hypothesis" }>> = [];

  const emitFired = (hypothesis: Hypothesis) => {
    const recency = hasWords
      ? recencyBoost(hypothesis.occurredAt, now)
      : Math.min(recencyBoost(hypothesis.occurredAt, now), 0.25);
    const semantic = 0.4 * (semanticScores[hypothesis.id] ?? 0);
    events.push({
      t: "hypothesis",
      kind: hypothesis.kind,
      base: round(hypothesis.baseScore),
      recency: round(recency),
      semantic: round(semantic),
      total: round(hypothesis.baseScore + recency + semantic),
      fired: true,
      why: hypothesis.evidence[0] ?? "the account condition matched",
    });
    emitted.add(hypothesis.id);
  };

  for (const rule of CORE_RULES) {
    const matches = hypotheses.filter(
      (hypothesis) => hypothesis.kind === rule.kind,
    );
    if (matches.length) {
      for (const hypothesis of matches) emitFired(hypothesis);
    } else {
      events.push({
        t: "hypothesis",
        kind: rule.kind,
        base: rule.base,
        recency: 0,
        semantic: 0,
        total: 0,
        fired: false,
        why: rule.absent,
      });
    }
  }

  for (const hypothesis of hypotheses) {
    if (!emitted.has(hypothesis.id)) emitFired(hypothesis);
  }
  return events;
}

function accountRecordCount(state: AccountState): number {
  return (
    state.orders.length +
    state.charges.length +
    state.subscriptions.length +
    state.refunds.length +
    state.priorTickets.length
  );
}

function escalationHypothesis(
  state: AccountState,
  fragment: string,
  now: Date,
): Hypothesis {
  const words = normalizeFragment(fragment);
  return {
    id: "human-handoff",
    kind: "human_handoff",
    title: "Talk to a person",
    detail: words
      ? "A support specialist will read the words you shared."
      : "A support specialist will review this account with you.",
    evidence: [
      "No account condition matched a safe automatic action.",
      `Account: ${state.email}.`,
    ],
    occurredAt: now.toISOString(),
    baseScore: 0.1,
    variants: ["person", "human", "someone", "more help"],
    action: {
      kind: "escalate_support",
      label: "Send this to a person",
      fragment,
    },
  };
}

export function hypothesesForPipeline(
  state: AccountState,
  fragment: string,
  now = new Date(),
): Hypothesis[] {
  const detected = generateHypotheses(state, now);
  return detected.length > 0
    ? detected
    : [escalationHypothesis(state, fragment, now)];
}

function outputSource(
  legacySource: ProviderSource,
  copySource: ProviderSource,
): ProviderSource {
  if (legacySource === "live" || copySource === "live") return "live";
  if (legacySource === "fallback" || copySource === "fallback") {
    return "fallback";
  }
  return "fixture";
}

export async function* streamResolution(
  input: ResolutionPipelineInput,
): AsyncGenerator<PipelineEvent> {
  const { email, fragment, requestedDemoMode, signal } = input;
  const requestId = crypto.randomUUID();
  const useLive = liveIntegrationsAllowed(requestedDemoMode);
  const effectiveDemo = !useLive;
  const intendedSource: ProviderSource = effectiveDemo ? "fixture" : "live";

  ensureActive(signal);
  yield stageStart(
    "composio",
    "reading merchant records",
    intendedSource,
    effectiveDemo,
  );
  for (const event of accountOpeningReasoning(email, fragment)) yield event;

  const accountStartedAt = Date.now();
  const accountResult = await getAccountState(email, effectiveDemo);
  ensureActive(signal);
  const now = new Date();
  const hypotheses = hypothesesForPipeline(accountResult.state, fragment, now);

  if (accountResult.source === "fallback") yield recovered("composio");
  for (const event of evidenceEvents(accountResult.state, hypotheses)) {
    yield event;
  }
  const composioSimulated = accountResult.source === "fixture";
  yield stageDone(
    "composio",
    composioSimulated
      ? deterministicLatency("composio", email, fragment)
      : Math.max(1, Date.now() - accountStartedAt),
    `${accountRecordCount(accountResult.state)} records from merchant sources`,
    accountResult.source,
    composioSimulated,
  );

  const accountReasoningContext: ReasoningContext = {
    state: accountResult.state,
    fragment,
    hypotheses,
    ranked: [],
    semanticScores: {},
    keywordScores: {},
    now,
  };
  for (const event of accountFindingsReasoning(accountReasoningContext)) {
    yield event;
  }

  const keywordScores = Object.fromEntries(
    hypotheses.map((hypothesis) => [
      hypothesis.id,
      keywordSimilarity(fragment, hypothesis),
    ]),
  );
  let semanticScores = Object.fromEntries(
    hypotheses.map((hypothesis) => [
      hypothesis.id,
      fixtureSemanticScore(fragment, hypothesis),
    ]),
  );
  let octenSource: ProviderSource;
  let octenSimulated = false;
  let octenMs = 0;
  let heldGoldenScores = false;

  yield stageStart(
    "octen",
    normalizeFragment(fragment) ? "embedding fragment" : "no fragment to embed",
    normalizeFragment(fragment) ? intendedSource : "skipped",
    effectiveDemo && Boolean(normalizeFragment(fragment)),
  );
  const octenStartedAt = Date.now();
  if (!normalizeFragment(fragment)) {
    octenSource = "skipped";
  } else if (effectiveDemo) {
    octenSource = "fixture";
    octenSimulated = true;
    octenMs = deterministicLatency("octen", email, fragment);
  } else {
    try {
      const liveScores = await getOctenSimilarityScores(fragment, hypotheses);
      // Golden paths stay stable on stage, while the real call is still
      // measured and visible. Every other fragment uses Octen's live scores.
      if (!isLockedDemoFragment(fragment)) semanticScores = liveScores;
      else heldGoldenScores = true;
      octenSource = "live";
    } catch (error) {
      console.info("[Wordless] Octen semantic fallback", error);
      octenSource = "fallback";
      yield recovered("octen");
    }
    octenMs = Math.max(1, Date.now() - octenStartedAt);
  }
  ensureActive(signal);

  for (const event of semanticEvents(
    fragment,
    hypotheses,
    semanticScores,
    keywordScores,
  )) {
    yield event;
  }
  yield stageDone(
    "octen",
    octenMs,
    octenSource === "skipped"
      ? "no fragment; account evidence only"
      : heldGoldenScores
        ? "live embedding measured; golden scores held stable"
        : `${hypotheses.length} account states compared`,
    octenSource,
    octenSimulated,
  );

  const ranked = rankHypotheses(hypotheses, fragment, semanticScores, now);
  const reasoningContext: ReasoningContext = {
    state: accountResult.state,
    fragment,
    hypotheses,
    ranked,
    semanticScores,
    keywordScores,
    now,
  };
  for (const event of fragmentReasoning(reasoningContext)) yield event;
  for (const event of decisionReasoning(reasoningContext)) yield event;
  for (const event of hypothesisEvents(
    fragment,
    hypotheses,
    semanticScores,
    now,
  )) {
    yield event;
  }

  const codexWillUseFixture =
    effectiveDemo || isLockedDemoFragment(fragment);
  yield stageStart(
    "codex",
    "writing accessible choices",
    codexWillUseFixture ? "fixture" : intendedSource,
    codexWillUseFixture,
  );
  for (const event of writingReasoning(ranked.length)) yield event;
  const copyStartedAt = Date.now();
  const [legacy, copy] = await Promise.all([
    legacyResponse(fragment, effectiveDemo),
    generateCardCopy(hypotheses, fragment, effectiveDemo),
  ]);
  ensureActive(signal);
  const codexSource = outputSource(legacy.source, copy.source);
  if (codexSource === "fallback") yield recovered("codex");

  const tokenMode: "demo" | "live" = useLive ? "live" : "demo";
  const cards: CandidateView[] = await Promise.all(
    ranked.map(async (candidate) => {
      const generated = copy.value.get(candidate.id);
      return {
        id: candidate.id,
        kind: candidate.kind,
        title: generated?.title ?? candidate.title,
        detail: generated?.detail ?? candidate.detail,
        evidence: candidate.evidence,
        occurredAt: candidate.occurredAt,
        actionLabel: candidate.action.label,
        actionToken: await signActionToken({
          requestId,
          candidateId: candidate.id,
          email,
          mode: tokenMode,
        }),
      };
    }),
  );
  if (cards.length === 0) {
    throw new Error("No ranked choices were available.");
  }

  const codexSimulated = codexSource === "fixture";
  yield stageDone(
    "codex",
    codexSimulated
      ? deterministicLatency("codex", email, fragment)
      : Math.max(1, Date.now() - copyStartedAt),
    `${cards.length} accessible choices ready`,
    codexSource,
    codexSimulated,
  );

  const mode: ResolveResponse["mode"] = requestedDemoMode
    ? "demo"
    : useLive && accountResult.source === "live"
      ? "live"
      : "fallback";
  const response: ResolveResponse = {
    requestId,
    email,
    accountName: accountResult.state.name,
    legacy: legacy.value,
    candidates: cards,
    status: "Reading your account. You don’t need to explain.",
    requestedMode: requestedDemoMode ? "demo" : "live",
    mode,
    providers: {
      composio: accountResult.source,
      octen: octenSource,
      openai: codexSource,
    },
  };

  // The terminal event deliberately repeats cards under the contract's
  // `cards` key and carries the legacy ResolveResponse for current clients.
  yield { t: "candidates", cards, response };
}
