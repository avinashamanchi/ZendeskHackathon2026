/**
 * Generated offline from data/ticket-corpus.json.
 *
 * The detector catalogue is committed so the runtime never needs a model or
 * network connection. Rebuild it with `npm run generate:rules` after changing
 * the historical ticket corpus.
 */
import type { AccountState, Hypothesis } from "./types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function daysBetween(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / DAY_MS));
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function firstItemName(state: AccountState, orderId: string): string {
  return state.orders.find((order) => order.id === orderId)?.items[0]?.name ?? "your item";
}

export function generateHypotheses(
  state: AccountState,
  now = new Date(),
): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];
  const succeededCharges = state.charges
    .filter((charge) => charge.status === "succeeded")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const usedChargeIds = new Set<string>();

  for (let index = 0; index < succeededCharges.length; index += 1) {
    const first = succeededCharges[index];
    if (usedChargeIds.has(first.id)) continue;

    const duplicate = succeededCharges.slice(index + 1).find((candidate) => {
      const minutesApart =
        Math.abs(Date.parse(candidate.createdAt) - Date.parse(first.createdAt)) /
        60_000;
      return (
        !usedChargeIds.has(candidate.id) &&
        candidate.amount === first.amount &&
        candidate.orderId === first.orderId &&
        minutesApart <= 60
      );
    });

    if (duplicate) {
      usedChargeIds.add(first.id);
      usedChargeIds.add(duplicate.id);
      const amount = formatCurrency(duplicate.amount);
      hypotheses.push({
        id: `duplicate-charge-${duplicate.id}`,
        kind: "duplicate_charge",
        title: "You were charged twice",
        detail: `Two charges of ${amount} on ${formatDate(duplicate.createdAt)} for order ${duplicate.orderId}.`,
        evidence: [
          `${first.id}: ${amount} on ${formatTimestamp(first.createdAt)}, succeeded.`,
          `${duplicate.id}: ${amount} on ${formatTimestamp(duplicate.createdAt)}, succeeded.`,
          `Both charges belong to order ${duplicate.orderId}.`,
        ],
        occurredAt: duplicate.createdAt,
        baseScore: 0.9,
        variants: [
          "money",
          "bank",
          "card",
          "took twice",
          "paid two",
          "same charge again",
          "double payment",
        ],
        action: {
          kind: "refund_duplicate",
          label: `Refund ${amount}`,
          chargeId: duplicate.id,
          orderId: duplicate.orderId,
          amount: duplicate.amount,
        },
      });
    }
  }

  for (const order of state.orders) {
    if (order.status === "delivered" && order.deliveredAt) {
      const ageDays = daysBetween(now, new Date(order.deliveredAt));
      if (ageDays <= 14) {
        const itemName = order.items[0]?.name ?? "your item";
        hypotheses.push({
          id: `wrong-item-${order.id}`,
          kind: "wrong_item",
          title: "Something's wrong with what arrived",
          detail: `Order ${order.id} arrived ${ageDays} days ago with ${itemName}.`,
          evidence: [
            `Order ${order.id} was delivered ${ageDays} days ago.`,
            `The order contains ${itemName}.`,
            "Recent deliveries often explain replacement requests.",
          ],
          occurredAt: order.deliveredAt,
          baseScore: 0.7,
          variants: [
            "wrong thing",
            "what came",
            "arrived broken",
            "water thing",
            "boily thing",
            "the hot one",
            "thing for tea",
            itemName,
          ],
          action: {
            kind: "replace_item",
            label: "Replace this item",
            orderId: order.id,
            sku: order.items[0]?.sku ?? "unknown",
            itemName,
          },
        });
      }
    }

    if (
      order.status !== "delivered" &&
      order.promisedBy &&
      Date.parse(order.promisedBy) < now.getTime()
    ) {
      hypotheses.push({
        id: `late-delivery-${order.id}`,
        kind: "late_delivery",
        title: "Your order is late",
        detail: `Order ${order.id} was due ${formatDate(order.promisedBy)} and is still in transit.`,
        evidence: [
          `Promised date: ${formatDate(order.promisedBy)}.`,
          `Current status: ${order.status.replace("_", " ")}.`,
          `Item: ${firstItemName(state, order.id)}.`,
        ],
        occurredAt: order.promisedBy,
        baseScore: 0.8,
        variants: [
          "not here",
          "still waiting",
          "where thing",
          "delivery",
          "late",
          "never came",
        ],
        action: {
          kind: "trace_delivery",
          label: "Trace this delivery",
          orderId: order.id,
        },
      });
    }

    if (
      order.status === "in_transit" &&
      order.lastTrackingAt &&
      now.getTime() - Date.parse(order.lastTrackingAt) > 72 * HOUR_MS
    ) {
      const stalledDays = daysBetween(now, new Date(order.lastTrackingAt));
      hypotheses.push({
        id: `tracking-stalled-${order.id}`,
        kind: "tracking_stalled",
        title: "Tracking has not moved",
        detail: `Order ${order.id} last moved ${stalledDays} days ago.`,
        evidence: [
          `Last tracking update: ${formatDate(order.lastTrackingAt)}.`,
          `Current status: ${order.status.replace("_", " ")}.`,
        ],
        occurredAt: order.lastTrackingAt,
        baseScore: 0.68,
        variants: [
          "stuck",
          "same place",
          "not moving",
          "tracking stopped",
          "where is it",
        ],
        action: {
          kind: "trace_delivery",
          label: "Trace this delivery",
          orderId: order.id,
        },
      });
    }
  }

  for (const subscription of state.subscriptions) {
    const ageDays = daysBetween(now, new Date(subscription.renewedAt));
    if (subscription.status === "active" && ageDays <= 7) {
      const amount = formatCurrency(subscription.amount);
      hypotheses.push({
        id: `renewal-${subscription.id}`,
        kind: "unexpected_renewal",
        title: "A subscription renewed",
        detail: `${subscription.planName} renewed on ${formatDate(subscription.renewedAt)} for ${amount}.`,
        evidence: [
          `Plan: ${subscription.planName}.`,
          `Renewed ${ageDays} days ago for ${amount}.`,
          `Current status: ${subscription.status}.`,
        ],
        occurredAt: subscription.renewedAt,
        baseScore: 0.6,
        variants: [
          "again",
          "came back",
          "money again",
          "monthly thing",
          "did not want another",
          "renewed",
        ],
        action: {
          kind: "review_renewal",
          label: "Review this renewal",
          subscriptionId: subscription.id,
          amount: subscription.amount,
        },
      });
    }
  }

  for (const refund of state.refunds) {
    const ageDays = daysBetween(now, new Date(refund.initiatedAt));
    if (refund.status !== "settled" && ageDays > 5) {
      const amount = formatCurrency(refund.amount);
      hypotheses.push({
        id: `refund-pending-${refund.id}`,
        kind: "refund_pending",
        title: "Your refund hasn't arrived",
        detail: `A refund of ${amount} was started ${ageDays} days ago.`,
        evidence: [
          `Refund ${refund.id}: ${amount}.`,
          `Started ${ageDays} days ago.`,
          `Current status: ${refund.status}.`,
        ],
        occurredAt: refund.initiatedAt,
        baseScore: 0.75,
        variants: [
          "money not back",
          "waiting for money",
          "return money",
          "still nothing",
          "refund missing",
        ],
        action: {
          kind: "trace_refund",
          label: "Trace this refund",
          refundId: refund.id,
          amount: refund.amount,
        },
      });
    }
  }

  for (const ticket of state.priorTickets) {
    const ageDays = daysBetween(now, new Date(ticket.createdAt));
    if (ageDays <= 30) {
      hypotheses.push({
        id: `ticket-followup-${ticket.id}`,
        kind: "prior_ticket_followup",
        title: "You contacted us before",
        detail: `Ticket #${ticket.id} about “${ticket.subject}” was updated ${ageDays} days ago.`,
        evidence: [
          `Ticket #${ticket.id}: ${ticket.subject}.`,
          `Status: ${ticket.status}.`,
          `Last updated ${ageDays} days ago.`,
        ],
        occurredAt: ticket.createdAt,
        baseScore: ticket.status === "open" || ticket.status === "pending" ? 0.5 : 0.35,
        variants: [
          "before",
          "same thing",
          "asked already",
          "still need help",
          "old ticket",
          ticket.subject,
        ],
        action: {
          kind: "continue_ticket",
          label: "Continue this ticket",
          ticketId: ticket.id,
        },
      });
    }
  }

  return hypotheses;
}
