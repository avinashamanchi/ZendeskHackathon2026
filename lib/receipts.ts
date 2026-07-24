import type { ActionSpec, ActReceipt } from "./types";
import { money } from "./format";

// Deterministic receipts. Client-safe (no SDK imports): the browser uses
// these directly if the API route is unreachable, and the server uses them
// as the fallback for every live write.

export function ticketNumber(spec: ActionSpec): number {
  const digits =
    typeof spec.orderId === "string" ? spec.orderId.replace(/\D/g, "") : "";
  if (digits && digits.length > 0) return parseInt(digits, 10);
  const seed = spec.chargeId ?? spec.refundId ?? spec.subscriptionId ?? spec.kind;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return 4400 + (Math.abs(h) % 100);
}

export function demoReceipt(spec: ActionSpec, mode: "live" | "demo"): ActReceipt {
  const ticketId = String(ticketNumber(spec));
  switch (spec.kind) {
    case "refund_duplicate": {
      const refundId = `re_pt_${spec.chargeId ?? "0000"}`;
      return {
        headline: `Done. Refund of ${money(spec.amount ?? 0)} sent.`,
        detail: `Stripe refund ${refundId} · Zendesk ticket #${ticketId} closed`,
        refundId,
        ticketId,
        mode,
      };
    }
    case "open_replacement":
      return {
        headline: "Done. A replacement is on the way.",
        detail: `Replacement order opened · Zendesk ticket #${ticketId} closed`,
        ticketId,
        mode,
      };
    case "trace_shipment":
      return {
        headline: "Done. Your package is being traced.",
        detail: `Carrier trace started · Zendesk ticket #${ticketId} open`,
        ticketId,
        mode,
      };
    case "refund_renewal": {
      const refundId = `re_pt_${spec.subscriptionId ?? "0000"}`;
      return {
        headline: `Done. Refund of ${money(spec.amount ?? 0)} sent. Renewals paused.`,
        detail: `Stripe refund ${refundId} · Zendesk ticket #${ticketId} closed`,
        refundId,
        ticketId,
        mode,
      };
    }
    case "expedite_refund":
      return {
        headline: `Done. Your ${money(spec.amount ?? 0)} refund is moving again.`,
        detail: `Processor escalation filed · Zendesk ticket #${ticketId} open`,
        ticketId,
        mode,
      };
    case "file_ticket":
      return {
        headline: "Done. A person has your message.",
        detail: `Zendesk ticket #${ticketId} open · your words are attached`,
        ticketId,
        mode,
      };
  }
}

/**
 * The honest receipt for a live write that did NOT complete. Never claim a
 * refund succeeded when it didn't — the work goes to a human instead.
 */
export function handoffReceipt(spec: ActionSpec): ActReceipt {
  const ticketId = String(ticketNumber(spec));
  return {
    headline: "Sent to a person to finish.",
    detail: `Zendesk ticket #${ticketId} open · a human will confirm`,
    ticketId,
    mode: "demo",
  };
}
