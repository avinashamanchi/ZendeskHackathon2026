import type { AccountState } from "./types";

// Fixtures are built PER CALL, not at module load: every consumer goes
// through fixtureFor(), so fixture ages are always exactly the designed
// offsets relative to the live clock the engines and ranking read. A dev
// server left running since yesterday's rehearsal still shows "arrived
// 2 days ago" — the demo can never go stale with process uptime.

function makeFixtures(): Record<string, AccountState> {
  const now = Date.now();
  const d = (days: number, hours = 0, minutes = 0, seconds = 0) =>
    new Date(
      now - days * 86_400_000 - hours * 3_600_000 - minutes * 60_000 - seconds * 1_000
    );

  /**
   * maria@example.com — DEMO-CRITICAL, the golden path.
   * Must generate exactly three hypotheses:
   *   duplicate_charge  — ch_9001/ch_9002, both $84.00, 40 seconds apart
   *   wrong_item        — kettle delivered 2 days ago (inside 14-day window)
   *   late_delivery     — kettle promised 3 days ago, delivered 2 days ago (late)
   */
  const maria: AccountState = {
    email: "maria@example.com",
    name: "Maria O.",
    orders: [
      {
        id: "A-4471",
        placedAt: d(6),
        status: "delivered",
        deliveredAt: d(2),
        promisedBy: d(3),
        items: [{ sku: "KT-118", name: "Ceramic kettle, 1.7L", qty: 1 }],
        total: 8400,
      },
      {
        id: "A-4390",
        placedAt: d(31),
        status: "delivered",
        deliveredAt: d(27),
        promisedBy: d(28),
        items: [{ sku: "MG-002", name: "Stoneware mug, set of 2", qty: 1 }],
        total: 3200,
      },
    ],
    charges: [
      { id: "ch_9001", amount: 8400, createdAt: d(6, 0, 0, 40), status: "succeeded", orderId: "A-4471" },
      { id: "ch_9002", amount: 8400, createdAt: d(6, 0, 0, 0), status: "succeeded", orderId: "A-4471" },
      { id: "ch_8800", amount: 3200, createdAt: d(31), status: "succeeded", orderId: "A-4390" },
    ],
    subscriptions: [],
    refunds: [],
    priorTickets: [
      { id: 3312, subject: "where is my order", createdAt: d(20), status: "solved" },
    ],
  };

  /**
   * sam@example.com — two hypotheses:
   *   unexpected_renewal — Tea Club renewed 3 days ago
   *   refund_pending     — $23.00 refund initiated 9 days ago, still unsettled
   */
  const sam: AccountState = {
    email: "sam@example.com",
    name: "Sam K.",
    orders: [],
    charges: [
      { id: "ch_7710", amount: 1400, createdAt: d(3), status: "succeeded" },
      { id: "ch_7300", amount: 2300, createdAt: d(40), status: "succeeded" },
    ],
    subscriptions: [
      {
        id: "sub_501",
        planName: "Tea Club, monthly",
        amount: 1400,
        startedAt: d(94),
        renewedAt: d(3),
        status: "active",
      },
    ],
    refunds: [{ id: "re_2201", amount: 2300, initiatedAt: d(9), chargeId: "ch_7300" }],
    priorTickets: [
      { id: 3120, subject: "cancel please", createdAt: d(41), status: "solved" },
    ],
  };

  /**
   * jo@example.com — one hypothesis:
   *   late_delivery — order placed 11 days ago, promised 4 days ago, still in transit
   */
  const jo: AccountState = {
    email: "jo@example.com",
    name: "Jo T.",
    orders: [
      {
        id: "A-4512",
        placedAt: d(11),
        status: "in_transit",
        promisedBy: d(4),
        items: [{ sku: "TP-330", name: "Teapot, cast iron", qty: 1 }],
        total: 6100,
      },
    ],
    charges: [
      { id: "ch_9110", amount: 6100, createdAt: d(11), status: "succeeded", orderId: "A-4512" },
    ],
    subscriptions: [],
    refunds: [],
    priorTickets: [],
  };

  /**
   * clean@example.com — the falsifiable claim. A healthy account: an old
   * order, delivered on time, one settled charge, nothing recent. MUST yield
   * ZERO hypotheses. If it doesn't, the rules are too loose and the thesis
   * collapses.
   */
  const clean: AccountState = {
    email: "clean@example.com",
    name: "Lee P.",
    orders: [
      {
        id: "A-3901",
        placedAt: d(60),
        status: "delivered",
        deliveredAt: d(56),
        promisedBy: d(54),
        items: [{ sku: "CP-104", name: "Espresso cups, set of 4", qty: 1 }],
        total: 2800,
      },
    ],
    charges: [
      { id: "ch_5500", amount: 2800, createdAt: d(60), status: "succeeded", orderId: "A-3901" },
    ],
    subscriptions: [
      {
        id: "sub_310",
        planName: "Coffee Club, monthly",
        amount: 1600,
        startedAt: d(200),
        renewedAt: d(20),
        status: "active",
      },
    ],
    refunds: [
      { id: "re_1800", amount: 900, initiatedAt: d(30), settledAt: d(27), chargeId: "ch_5500" },
    ],
    priorTickets: [],
  };

  return {
    [maria.email]: maria,
    [sam.email]: sam,
    [jo.email]: jo,
    [clean.email]: clean,
  };
}

/** The customers the hidden Cmd/Ctrl+K control cycles through, in order. */
export const DEMO_CYCLE = ["maria@example.com", "sam@example.com", "jo@example.com"];

/** Fresh fixture, aged exactly as designed relative to right now. */
export function fixtureFor(email: string): AccountState {
  const fixtures = makeFixtures();
  return fixtures[email.toLowerCase().trim()] ?? fixtures["maria@example.com"];
}
