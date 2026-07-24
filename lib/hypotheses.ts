import type { AccountState, Charge, Hypothesis, Order } from "./types";
import { money, shortDate, daysAgo } from "./format";

// The hand-written hypothesis engine: five detectors over merchant account
// state. This file is the committed fallback for the Codex-generated engine
// (lib/hypotheses.generated.ts) so the generator can never block the build.
//
// The falsifiable claim this engine must uphold: a healthy account produces
// ZERO hypotheses. Ticket-generating accounts produce two or three.
// scripts/check.ts enforces it.

const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * Circumlocution phrasings, keyed by a token of the product name. Anomia does
 * not produce missing words — it produces talking *around* the word. These are
 * what let "the boily thing" find a kettle. In production these would be
 * mined from an embedding model over the catalog; the shape is the point.
 */
const CIRCUMLOCUTIONS: Record<string, string[]> = {
  kettle: ["water thing", "boily thing", "the hot one", "thing for tea", "pours hot water"],
  teapot: ["tea thing", "the pot", "thing for tea", "pouring one"],
  mug: ["cup", "the drinking one", "coffee thing"],
  cups: ["cup", "little ones", "coffee thing"],
};

function itemVariants(order: Order): string[] {
  const out: string[] = [];
  for (const item of order.items) {
    const plain = item.name.split(",")[0].toLowerCase();
    out.push(plain);
    for (const token of plain.split(/\s+/)) {
      if (CIRCUMLOCUTIONS[token]) out.push(...CIRCUMLOCUTIONS[token]);
    }
  }
  return out;
}

/** "Ceramic kettle, 1.7L" → "ceramic kettle", for mid-sentence use. */
function plainName(order: Order): string {
  return order.items[0]?.name.split(",")[0].toLowerCase() ?? "your item";
}

function detectDuplicateCharge(state: AccountState): Hypothesis[] {
  const out: Hypothesis[] = [];
  const seen = new Set<string>();
  const succeeded = state.charges.filter((c) => c.status === "succeeded");
  for (const a of succeeded) {
    for (const b of succeeded) {
      if (a.id >= b.id) continue;
      const pairKey = `${a.id}:${b.id}`;
      if (seen.has(pairKey)) continue;
      const closeInTime =
        Math.abs(a.createdAt.getTime() - b.createdAt.getTime()) <= HOUR;
      if (a.amount === b.amount && closeInTime) {
        seen.add(pairKey);
        const later: Charge = a.createdAt > b.createdAt ? a : b;
        const minutesApart = Math.round(
          Math.abs(a.createdAt.getTime() - b.createdAt.getTime()) / 60_000
        );
        out.push({
          id: `duplicate_charge:${later.id}`,
          kind: "duplicate_charge",
          title: "You were charged twice",
          detail: `Two charges of ${money(a.amount)} on ${shortDate(a.createdAt)} for order ${a.orderId ?? "—"}.`,
          evidence: [
            `Charge ${a.id} — ${money(a.amount)} — ${shortDate(a.createdAt)}`,
            `Charge ${b.id} — ${money(b.amount)} — ${minutesApart} minutes later`,
            a.orderId ? `Both point at order ${a.orderId}` : "No order attached to either charge",
          ],
          occurredAt: later.createdAt,
          baseScore: 0.9,
          variants: [
            "money", "bank", "card", "took twice", "paid two times", "double",
            "charged again", "twice", "two times money", "bill wrong",
          ],
          action: {
            kind: "refund_duplicate",
            amount: later.amount,
            chargeId: later.id,
            orderId: a.orderId,
            summary: `Duplicate charge: ${a.id} and ${b.id}, both ${money(a.amount)}, ${minutesApart} minutes apart. Refunding ${later.id}.`,
          },
        });
      }
    }
  }
  return out;
}

function detectLateDelivery(state: AccountState): Hypothesis[] {
  const out: Hypothesis[] = [];
  const now = Date.now();
  for (const order of state.orders) {
    const stillMissing =
      now > order.promisedBy.getTime() &&
      order.status !== "delivered" &&
      order.status !== "cancelled";
    const arrivedLate =
      order.status === "delivered" &&
      order.deliveredAt &&
      order.deliveredAt.getTime() > order.promisedBy.getTime() &&
      now - order.deliveredAt.getTime() <= 7 * DAY;

    if (stillMissing) {
      out.push({
        id: `late_delivery:${order.id}`,
        kind: "late_delivery",
        title: "Your order is late",
        detail: `Order ${order.id} was due ${shortDate(order.promisedBy)} and is still in transit.`,
        evidence: [
          `Order ${order.id} — placed ${shortDate(order.placedAt)}`,
          `Promised by ${shortDate(order.promisedBy)} — ${daysAgo(order.promisedBy)} days ago`,
          `Carrier status: ${order.status.replace("_", " ")}`,
        ],
        occurredAt: order.promisedBy,
        baseScore: 0.8,
        variants: [
          "where", "not here", "waiting", "still nothing", "package", "box",
          "late", "hasn't come", "no show", ...itemVariants(order),
        ],
        action: {
          kind: "trace_shipment",
          orderId: order.id,
          summary: `Order ${order.id} promised ${shortDate(order.promisedBy)}, still ${order.status}. Opening a carrier trace.`,
        },
      });
    } else if (arrivedLate) {
      out.push({
        id: `late_delivery:${order.id}`,
        kind: "late_delivery",
        title: "Your order arrived late",
        detail: `Order ${order.id} was due ${shortDate(order.promisedBy)} and arrived ${shortDate(order.deliveredAt!)}.`,
        evidence: [
          `Order ${order.id} — placed ${shortDate(order.placedAt)}`,
          `Promised by ${shortDate(order.promisedBy)}`,
          `Delivered ${shortDate(order.deliveredAt!)} — ${daysAgo(order.deliveredAt!)} days ago`,
        ],
        occurredAt: order.promisedBy,
        baseScore: 0.8,
        variants: ["late", "slow", "took long", "finally came", ...itemVariants(order)],
        action: {
          kind: "trace_shipment",
          orderId: order.id,
          summary: `Order ${order.id} arrived after its ${shortDate(order.promisedBy)} promise. Filing a late-delivery report.`,
        },
      });
    }
  }
  return out;
}

function detectRefundPending(state: AccountState): Hypothesis[] {
  const out: Hypothesis[] = [];
  const now = Date.now();
  for (const refund of state.refunds) {
    if (!refund.settledAt && now - refund.initiatedAt.getTime() > 5 * DAY) {
      out.push({
        id: `refund_pending:${refund.id}`,
        kind: "refund_pending",
        title: "Your refund hasn't arrived",
        detail: `A refund of ${money(refund.amount)} was started ${daysAgo(refund.initiatedAt)} days ago.`,
        evidence: [
          `Refund ${refund.id} — ${money(refund.amount)}`,
          `Initiated ${shortDate(refund.initiatedAt)} — ${daysAgo(refund.initiatedAt)} days ago`,
          `Original charge ${refund.chargeId}`,
          "Not settled to the card yet",
        ],
        occurredAt: refund.initiatedAt,
        baseScore: 0.75,
        variants: [
          "money back", "still waiting money", "bank nothing", "where money",
          "refund", "gave back", "not in account",
        ],
        action: {
          kind: "expedite_refund",
          refundId: refund.id,
          amount: refund.amount,
          summary: `Refund ${refund.id} (${money(refund.amount)}) unsettled after ${daysAgo(refund.initiatedAt)} days. Escalating with the processor.`,
        },
      });
    }
  }
  return out;
}

function detectWrongItem(state: AccountState): Hypothesis[] {
  const out: Hypothesis[] = [];
  const now = Date.now();
  for (const order of state.orders) {
    if (
      order.status === "delivered" &&
      order.deliveredAt &&
      now - order.deliveredAt.getTime() <= 14 * DAY
    ) {
      out.push({
        id: `wrong_item:${order.id}`,
        kind: "wrong_item",
        title: "Something's wrong with what arrived",
        detail: `Order ${order.id} arrived ${daysAgo(order.deliveredAt)} days ago with the ${plainName(order)}.`,
        evidence: [
          `Order ${order.id} — delivered ${shortDate(order.deliveredAt)}`,
          ...order.items.map((i) => `${i.name} × ${i.qty}`),
          "Contact within 14 days of delivery",
        ],
        occurredAt: order.deliveredAt,
        baseScore: 0.7,
        variants: [
          "broke", "broken", "arrived broken", "not right", "wrong", "damaged",
          "cracked", "doesn't work", "bad", ...itemVariants(order),
        ],
        action: {
          kind: "open_replacement",
          orderId: order.id,
          summary: `Problem with delivered order ${order.id} (${plainName(order)}). Opening a replacement.`,
        },
      });
    }
  }
  return out;
}

function detectUnexpectedRenewal(state: AccountState): Hypothesis[] {
  const out: Hypothesis[] = [];
  const now = Date.now();
  for (const sub of state.subscriptions) {
    if (sub.status === "active" && now - sub.renewedAt.getTime() <= 7 * DAY) {
      const plan = sub.planName.split(",")[0];
      out.push({
        id: `unexpected_renewal:${sub.id}`,
        kind: "unexpected_renewal",
        title: "A subscription renewed",
        detail: `${plan} renewed on ${shortDate(sub.renewedAt)} for ${money(sub.amount)}.`,
        evidence: [
          `${sub.planName} — ${money(sub.amount)}`,
          `Renewed ${shortDate(sub.renewedAt)} — ${daysAgo(sub.renewedAt)} days ago`,
          `Subscribed since ${shortDate(sub.startedAt)}`,
        ],
        occurredAt: sub.renewedAt,
        baseScore: 0.6,
        variants: [
          "again", "keeps taking", "every month", "took money again",
          "didn't want", "stop it", "cancel", "subscription",
        ],
        action: {
          kind: "refund_renewal",
          subscriptionId: sub.id,
          amount: sub.amount,
          summary: `Unexpected renewal of ${sub.planName} (${money(sub.amount)}). Refunding and pausing the subscription.`,
        },
      });
    }
  }
  return out;
}

/**
 * All detectors over one account. Order here is irrelevant — ranking happens
 * in lib/rank.ts. A healthy account MUST return [].
 */
export function generateHypotheses(state: AccountState): Hypothesis[] {
  return [
    ...detectDuplicateCharge(state),
    ...detectLateDelivery(state),
    ...detectRefundPending(state),
    ...detectWrongItem(state),
    ...detectUnexpectedRenewal(state),
  ];
}
