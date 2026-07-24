import { signActionToken, verifyActionToken } from "./action-token";
import {
  executeAction,
  getAccountState,
  notCompletedReceipt,
} from "./composio";
import { generateHypotheses } from "./hypotheses.generated";
import { isLockedDemoFragment } from "./fixtures";
import { generateCardCopy, legacyResponse } from "./llm";
import { getOctenSimilarityScores } from "./octen";
import { rankHypotheses } from "./rank";
import {
  liveIntegrationsAllowed,
  liveWritesAllowed,
} from "./runtime";
import type {
  ActionReceipt,
  CandidateView,
  ProviderSource,
  ResolveResponse,
} from "./types";

export interface ResolveWordlessInput {
  email: string;
  fragment: string;
  requestedDemoMode: boolean;
}

export async function resolveWordless({
  email,
  fragment,
  requestedDemoMode,
}: ResolveWordlessInput): Promise<ResolveResponse> {
  const requestId = crypto.randomUUID();
  const useLive = liveIntegrationsAllowed(requestedDemoMode);
  const effectiveDemo = !useLive;
  const legacyPromise = legacyResponse(fragment, effectiveDemo);
  const accountResult = await getAccountState(email, effectiveDemo);
  const hypotheses = generateHypotheses(accountResult.state);

  let octenScores: Record<string, number> | null = null;
  let octenSource: ProviderSource = effectiveDemo ? "fixture" : "fallback";
  const octenPromise = (async () => {
    if (effectiveDemo || !fragment.trim()) return;
    try {
      const scores = await getOctenSimilarityScores(fragment, hypotheses);
      octenSource = "live";
      // The stage paths stay committed and deterministic. Live Octen scores
      // drive every non-golden fragment.
      if (!isLockedDemoFragment(fragment)) octenScores = scores;
    } catch (error) {
      console.info("[Wordless] Octen ranking fallback", error);
      octenSource = "fallback";
    }
  })();

  const copyPromise = generateCardCopy(
    hypotheses,
    fragment,
    effectiveDemo,
  );
  const [legacy, copy] = await Promise.all([
    legacyPromise,
    copyPromise,
    octenPromise,
  ]);

  const ranked = rankHypotheses(hypotheses, fragment, octenScores);
  const tokenMode: "demo" | "live" = useLive ? "live" : "demo";
  const candidates: CandidateView[] = await Promise.all(
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

  const mode: ResolveResponse["mode"] = requestedDemoMode
    ? "demo"
    : useLive && accountResult.source === "live"
      ? "live"
      : "fallback";

  return {
    requestId,
    email,
    accountName: accountResult.state.name,
    legacy: legacy.value,
    candidates,
    status: "Reading your account. You don’t need to explain.",
    requestedMode: requestedDemoMode ? "demo" : "live",
    mode,
    providers: {
      composio: accountResult.source,
      octen: octenSource,
      openai:
        legacy.source === "live" || copy.source === "live"
          ? "live"
          : legacy.source === "fallback" || copy.source === "fallback"
            ? "fallback"
            : "fixture",
    },
  };
}

export async function actOnToken(
  token: string,
): Promise<ActionReceipt> {
  const payload = await verifyActionToken(token);
  if (!payload) return notCompletedReceipt(false);

  const requestedDemoMode = payload.mode === "demo";
  const useLive = liveIntegrationsAllowed(requestedDemoMode);
  const accountResult = await getAccountState(payload.email, !useLive);
  const hypothesis = generateHypotheses(accountResult.state).find(
    (candidate) => candidate.id === payload.candidateId,
  );
  if (!hypothesis) return notCompletedReceipt(false);

  if (requestedDemoMode) {
    return executeAction(
      hypothesis.action,
      payload.email,
      `${payload.requestId}:${payload.candidateId}`,
      true,
    );
  }

  if (
    !liveWritesAllowed(false) ||
    !useLive ||
    accountResult.source !== "live"
  ) {
    return notCompletedReceipt(false);
  }

  return executeAction(
    hypothesis.action,
    payload.email,
    `${payload.requestId}:${payload.candidateId}`,
    false,
  );
}
