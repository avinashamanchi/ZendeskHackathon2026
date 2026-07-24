// Writes /data/ticket-corpus.json: 350 synthetic resolved support tickets in
// the merchant's domain — subject, body, resolution, and the account state at
// the time of contact. Realistic and messy: fragments, typos, circumlocution.
//
// Run ONCE, offline: npm run generate:corpus
// Deterministic (seeded PRNG) so the corpus — and everything derived from it —
// is reproducible.
//
// There is NO reason-for-contact label in the data. The rule generator has to
// discover the clusters itself (it does so from resolution text), which is
// what makes the derived engine an answer to "did you just hardcode this?"

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "ticket-corpus.json");

// mulberry32 — tiny seeded PRNG
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260723);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 23); // fixed epoch so the corpus is stable

const PRODUCTS = [
  "Ceramic kettle, 1.7L", "Stoneware mug, set of 2", "Teapot, cast iron",
  "Espresso cups, set of 4", "Pour-over dripper", "Electric gooseneck kettle",
  "Matcha whisk set", "Cold brew carafe", "Travel tumbler, 12oz", "Tea sampler box",
];

// Aphasic and non-aphasic voices alike appear in ticket history; the miner
// later surfaces whatever phrasings actually recur.
const VOICES = {
  duplicate_charge: {
    subjects: ["charged twice", "double charge??", "two charges same day", "billing wrong", "money taken 2 times", "why two charges"],
    bodies: [
      "you took money twice. same amount. fix please",
      "I was charged again for the same order?? my bank shows two charges",
      "money... twice... card... help",
      "charged double for one order, want the extra back",
      "looked at my statement and theres two charges for the same thing",
      "paid two times. one order. bank shows double",
    ],
    resolutions: [
      "Refunded duplicate charge; confirmed single fulfilment.",
      "Duplicate charge refunded to card; apologised for billing error.",
      "Verified double charge, refunded the second charge.",
    ],
  },
  late_delivery: {
    subjects: ["where is my order", "order late", "still waiting", "package not here", "not arrived yet", "delivery??"],
    bodies: [
      "order was promised last week. still nothing. where is it",
      "still waiting... package... nothing came",
      "its been days past the delivery date, tracking not moving",
      "where box? said friday. no box.",
      "my order hasn't come and the date passed already",
      "not here. waiting. long time.",
      "it finally came but days late, that's not ok",
      "arrived at last... late... too late",
    ],
    resolutions: [
      "Opened carrier trace; shipment located and delivered.",
      "Traced shipment with carrier, provided updated ETA.",
      "Carrier trace opened; expedited remainder of route.",
    ],
  },
  wrong_item: {
    subjects: ["item broken", "wrong thing arrived", "damaged in box", "not what i ordered", "arrived broken", "problem with delivery"],
    bodies: [
      "the boily thing broke. crack in side. water everywhere",
      "the water thing arrived cracked, leaks when I pour",
      "box came but wrong item inside, ordered the kettle got mugs",
      "arrived broken... the hot one... glass everywhere",
      "thing for tea came damaged, chip on the spout",
      "opened the box and its smashed. want a new one",
    ],
    resolutions: [
      "Replacement sent; no return required for damaged item.",
      "Sent replacement order; damaged unit written off.",
      "Confirmed wrong/damaged item, replacement shipped.",
    ],
  },
  unexpected_renewal: {
    subjects: ["subscription charged again", "didnt want renewal", "cancel and refund", "why charged monthly", "it took money again", "stop subscription"],
    bodies: [
      "it charged me again this month. didn't want it. stop it",
      "the club thing keeps taking money every month, cancel please",
      "again!! money again. no.",
      "thought I cancelled but it renewed anyway, refund me",
      "subscription took money again, I don't use it anymore",
      "keeps taking. every month. didn't want.",
    ],
    resolutions: [
      "Cancelled renewal and refunded; subscription paused.",
      "Refunded renewal charge, paused subscription per request.",
      "Renewal refunded; auto-renew disabled.",
    ],
  },
  refund_pending: {
    subjects: ["refund not received", "wheres my money back", "refund still pending", "no refund yet", "money not back", "refund??"],
    bodies: [
      "you said refund days ago. bank shows nothing. where money",
      "still waiting for my money back, its been over a week",
      "money back... nothing... bank empty...",
      "the refund never arrived on my card, please check",
      "was told 5 days for the refund. its been more. nothing.",
      "no money came back yet. checked every day.",
    ],
    resolutions: [
      "Escalated refund with processor; settled next day.",
      "Refund escalated with payment processor, confirmed settlement.",
      "Processor escalation filed; refund pushed through.",
    ],
  },
  // Noise clusters — real ticket history is messy. These stay below the
  // frequency threshold, so the generator must NOT emit detectors for them.
  password_reset: {
    subjects: ["cant log in", "password reset broken", "locked out"],
    bodies: ["reset email never comes, checked spam", "cant get into my account at all", "login loop, keeps kicking me out"],
    resolutions: ["Sent manual reset link; account recovered."],
  },
  promo_code: {
    subjects: ["promo code not working", "discount didnt apply"],
    bodies: ["code TEATIME says invalid at checkout", "the 10% off never applied to my order"],
    resolutions: ["Honoured promo retroactively as account credit."],
  },
  address_change: {
    subjects: ["change delivery address", "moved house"],
    bodies: ["need to update the address before it ships", "put my old address by mistake"],
    resolutions: ["Updated shipping address before dispatch."],
  },
  receipt_request: {
    subjects: ["need invoice", "receipt for expenses"],
    bodies: ["can you send a proper invoice for order", "need the receipt as pdf for work"],
    resolutions: ["Emailed PDF invoice."],
  },
} as const;

type Reason = keyof typeof VOICES;

// Cluster sizes and feature co-occurrence are set so that
// P(cluster | feature) — "when this state is present, how often is it the
// reason for contact" — lands where severity intuition says it should:
// duplicate charges almost always cause contact (0.90); recent deliveries
// only sometimes do (0.70). The generator COMPUTES these; nothing downstream
// hardcodes them.
const PLAN: {
  reason: Reason;
  count: number;
  coFeatures: Partial<Record<"dup" | "late" | "delivered" | "renewal" | "refund", number>>;
}[] = [
  { reason: "wrong_item", count: 112, coFeatures: { dup: 3, refund: 6 } },
  { reason: "late_delivery", count: 72, coFeatures: { dup: 3, renewal: 6 } },
  { reason: "duplicate_charge", count: 54, coFeatures: { delivered: 14, renewal: 6, late: 10 } },
  { reason: "refund_pending", count: 45, coFeatures: { delivered: 10, renewal: 8 } },
  { reason: "unexpected_renewal", count: 39, coFeatures: { delivered: 4, refund: 4 } },
  { reason: "password_reset", count: 9, coFeatures: { delivered: 2, late: 3 } },
  { reason: "promo_code", count: 7, coFeatures: { delivered: 2, late: 3 } },
  { reason: "address_change", count: 6, coFeatures: { renewal: 6, refund: 5 } },
  { reason: "receipt_request", count: 6, coFeatures: { delivered: 2, late: 2 } },
];

// Within the late_delivery cluster, the first N tickets are "arrived, but
// late" (delivered after the promise, recently) rather than still-missing —
// both generate contact, and the derived detector must cover both.
const ARRIVED_LATE_PER_CLUSTER: Partial<Record<Reason, number>> = { late_delivery: 14 };

function typo(s: string): string {
  if (rand() > 0.25) return s;
  const i = between(1, Math.max(1, s.length - 2));
  return s.slice(0, i) + s.slice(i + 1); // dropped letter
}

interface TicketState {
  orders: unknown[];
  charges: unknown[];
  subscriptions: unknown[];
  refunds: unknown[];
}

function buildState(
  reason: Reason,
  extras: Set<string>,
  t: number,
  arrivedLate: boolean
): TicketState {
  const state: TicketState = { orders: [], charges: [], subscriptions: [], refunds: [] };
  const product = pick(PRODUCTS);
  const amount = between(1400, 12800);
  const oid = `A-${between(1000, 9999)}`;

  const has = (f: string) =>
    extras.has(f) ||
    (reason === "duplicate_charge" && f === "dup") ||
    (reason === "late_delivery" && f === "late") ||
    (reason === "wrong_item" && f === "delivered") ||
    (reason === "unexpected_renewal" && f === "renewal") ||
    (reason === "refund_pending" && f === "refund");

  if (has("dup")) {
    const at = t - between(1, 6) * DAY;
    state.charges.push(
      { id: `ch_${between(1000, 9999)}`, amount, createdAt: new Date(at).toISOString(), status: "succeeded", orderId: oid },
      { id: `ch_${between(1000, 9999)}`, amount, createdAt: new Date(at + between(2, 55) * 60_000).toISOString(), status: "succeeded", orderId: oid }
    );
  }
  if (has("late")) {
    if (arrivedLate) {
      // delivered after the promise, within the last few days
      const deliveredAt = t - between(0, 4) * DAY;
      state.orders.push({
        id: oid, placedAt: new Date(deliveredAt - between(6, 10) * DAY).toISOString(),
        status: "delivered", deliveredAt: new Date(deliveredAt).toISOString(),
        promisedBy: new Date(deliveredAt - between(1, 3) * DAY).toISOString(),
        items: [{ sku: "SK-000", name: product, qty: 1 }], total: amount,
      });
    } else {
      state.orders.push({
        id: oid, placedAt: new Date(t - between(8, 15) * DAY).toISOString(), status: "in_transit",
        promisedBy: new Date(t - between(1, 6) * DAY).toISOString(),
        items: [{ sku: "SK-000", name: product, qty: 1 }], total: amount,
      });
    }
  }
  if (has("delivered")) {
    // delivered on time (before or on the promise), recently
    const deliveredAt = t - between(1, 12) * DAY;
    state.orders.push({
      id: `A-${between(1000, 9999)}`, placedAt: new Date(deliveredAt - between(3, 6) * DAY).toISOString(),
      status: "delivered", deliveredAt: new Date(deliveredAt).toISOString(),
      promisedBy: new Date(deliveredAt + between(0, 2) * DAY).toISOString(),
      items: [{ sku: "SK-000", name: product, qty: 1 }], total: amount,
    });
  }
  if (has("renewal")) {
    state.subscriptions.push({
      id: `sub_${between(100, 999)}`, planName: pick(["Tea Club, monthly", "Coffee Club, monthly"]),
      amount: between(1200, 2400), startedAt: new Date(t - between(60, 400) * DAY).toISOString(),
      renewedAt: new Date(t - between(0, 6) * DAY).toISOString(), status: "active",
    });
  }
  if (has("refund")) {
    state.refunds.push({
      id: `re_${between(1000, 9999)}`, amount: between(900, 9000),
      initiatedAt: new Date(t - between(6, 14) * DAY).toISOString(), chargeId: `ch_${between(1000, 9999)}`,
    });
  }
  return state;
}

const tickets: unknown[] = [];
let id = 2000;
for (const { reason, count, coFeatures } of PLAN) {
  // Distribute co-occurring features across distinct tickets in the cluster
  // (sequential from a per-feature offset, so counts stay exact).
  const coAssignments: Set<string>[] = Array.from({ length: count }, () => new Set<string>());
  for (const [feature, n] of Object.entries(coFeatures)) {
    if ((n ?? 0) > count) throw new Error(`coFeature ${feature} exceeds cluster ${reason}`);
    const offset = feature.length % count;
    for (let k = 0; k < (n ?? 0); k++) coAssignments[(offset + k) % count].add(feature);
  }
  const arrivedLateCount = ARRIVED_LATE_PER_CLUSTER[reason] ?? 0;
  for (let i = 0; i < count; i++) {
    const t = NOW - between(5, 540) * DAY;
    const voice = VOICES[reason];
    tickets.push({
      id: id++,
      createdAt: new Date(t).toISOString(),
      subject: typo(pick([...voice.subjects])),
      body: typo(pick([...voice.bodies])),
      resolution: pick([...voice.resolutions]),
      accountState: buildState(reason, coAssignments[i], t, i < arrivedLateCount),
    });
  }
}

// shuffle so cluster membership isn't recoverable from record order
for (let i = tickets.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [tickets[i], tickets[j]] = [tickets[j], tickets[i]];
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date(NOW).toISOString(), tickets }, null, 1));
console.log(`Wrote ${tickets.length} tickets to ${OUT}`);
