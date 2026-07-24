import {
  getFixtureAccount,
  LEGACY_GOLDEN_RESPONSE,
} from "./fixtures";
import { generateHypotheses } from "./hypotheses.generated";
import { rankHypotheses } from "./rank";
import type {
  ActionReceipt,
  ActionSpec,
  CandidateView,
  ResolveResponse,
} from "./types";

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function fixtureReceipt(action: ActionSpec): ActionReceipt {
  switch (action.kind) {
    case "refund_duplicate":
      return {
        status: "completed",
        title: `Done. Refund of ${money(action.amount)} sent.`,
        detail: "The duplicate charge is going back to the original card.",
        reference: "Stripe refund re_3PqX · Zendesk ticket #4471 closed",
        source: "fixture",
      };
    case "replace_item":
      return {
        status: "completed",
        title: "Done. Replacement request opened.",
        detail: `${action.itemName} is linked to the request.`,
        reference: `Demo ticket #4472 · Order ${action.orderId}`,
        source: "fixture",
      };
    case "trace_delivery":
      return {
        status: "completed",
        title: "Done. Delivery trace opened.",
        detail: `The delivery team will check order ${action.orderId}.`,
        reference: `Demo ticket #4473 · Order ${action.orderId}`,
        source: "fixture",
      };
    case "review_renewal":
      return {
        status: "completed",
        title: "Done. Renewal review opened.",
        detail: `The ${money(action.amount)} renewal is attached to the request.`,
        reference: `Demo ticket #4526 · Subscription ${action.subscriptionId}`,
        source: "fixture",
      };
    case "trace_refund":
      return {
        status: "completed",
        title: "Done. Refund trace opened.",
        detail: `The ${money(action.amount)} refund is being checked.`,
        reference: `Demo trace #7121 · Refund ${action.refundId}`,
        source: "fixture",
      };
    case "continue_ticket":
      return {
        status: "completed",
        title: "Done. Your ticket is open.",
        detail: "A support specialist can continue from the earlier message.",
        reference: `Demo Zendesk ticket #${action.ticketId} reopened`,
        source: "fixture",
      };
    case "escalate_support":
      return {
        status: "completed",
        title: "Done. A person will help.",
        detail: "Your words and account details are attached to the request.",
        reference: "Zendesk ticket #4474 opened",
        source: "fixture",
      };
  }
}

export function fixtureReceiptForCandidate(
  email: string,
  candidateId: string,
): ActionReceipt {
  const account = getFixtureAccount(email);
  const candidate = generateHypotheses(account).find(
    (hypothesis) => hypothesis.id === candidateId,
  );
  return candidate
    ? fixtureReceipt(candidate.action)
    : {
        status: "not_completed",
        title: "Nothing changed.",
        detail: "That choice is no longer available.",
        reference: "Start again to refresh your choices.",
        source: "fixture",
      };
}

export function createClientFixtureResponse(
  email: string,
  fragment: string,
): ResolveResponse {
  const account = getFixtureAccount(email);
  const candidates: CandidateView[] = rankHypotheses(
    generateHypotheses(account),
    fragment,
  ).map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    title: candidate.title,
    detail: candidate.detail,
    evidence: candidate.evidence,
    occurredAt: candidate.occurredAt,
    actionLabel: candidate.action.label,
    actionToken: `local-fixture:${candidate.id}`,
  }));

  return {
    requestId: crypto.randomUUID(),
    email,
    accountName: account.name,
    legacy: LEGACY_GOLDEN_RESPONSE,
    candidates,
    status: "Reading your account. You don’t need to explain.",
    requestedMode: "demo",
    mode: "fallback",
    providers: {
      composio: "fixture",
      octen: "fixture",
      openai: "fixture",
    },
  };
}
