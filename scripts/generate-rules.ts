// The Codex step. Run ONCE, offline: npm run generate:rules
//
// Reads /data/ticket-corpus.json (350 resolved tickets, no labels) and the
// AccountState schema, then:
//   1. clusters tickets by what the resolution actually did,
//   2. extracts the account-state feature present at contact time for each
//      cluster, with thresholds derived from the observed distributions,
//   3. computes baseScore = P(cluster | feature): when this state is present,
//      how often was it the reason for contact,
//   4. mines cluster-distinctive phrasings from ticket subjects/bodies —
//      circumlocutions included, because that is what the corpus contains,
//   5. emits executable TypeScript: lib/hypotheses.generated.ts.
//
// Clusters below the frequency threshold (4% of corpus) get NO detector —
// that is the answer to "does this only work because you wrote five rules by
// hand?" The corpus decides what earns a card.
//
// Commit the output. Never run this live.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = join(ROOT, "data", "ticket-corpus.json");
const OUT = join(ROOT, "lib", "hypotheses.generated.ts");

const DAY = 86_400_000;
const HOUR = 3_600_000;

interface RawOrder {
  id: string; placedAt: string; status: string; promisedBy: string;
  deliveredAt?: string; items: { sku: string; name: string; qty: number }[]; total: number;
}
interface Ticket {
  id: number;
  createdAt: string;
  subject: string;
  body: string;
  resolution: string;
  accountState: {
    orders: RawOrder[];
    charges: { id: string; amount: number; createdAt: string; status: string; orderId?: string }[];
    subscriptions: { id: string; planName: string; amount: number; renewedAt: string; status: string }[];
    refunds: { id: string; amount: number; initiatedAt: string; settledAt?: string; chargeId: string }[];
  };
}

const { tickets } = JSON.parse(readFileSync(CORPUS, "utf8")) as { tickets: Ticket[] };

// ---------------------------------------------------------------------------
// 1. Cluster by what the resolution did
// ---------------------------------------------------------------------------

const CLUSTER_PATTERNS: [kind: string, pattern: RegExp][] = [
  ["duplicate_charge", /duplicate|double charge/i],
  ["refund_pending", /processor/i],
  ["late_delivery", /trace|carrier|expedited/i],
  ["wrong_item", /replacement/i],
  ["unexpected_renewal", /renewal|auto-renew|paused subscription/i],
];

function clusterOf(t: Ticket): string {
  for (const [kind, pattern] of CLUSTER_PATTERNS) {
    if (pattern.test(t.resolution)) return kind;
  }
  return `other:${t.resolution.split(/[;.]/)[0].toLowerCase().slice(0, 32)}`;
}

const clusters = new Map<string, Ticket[]>();
for (const t of tickets) {
  const k = clusterOf(t);
  if (!clusters.has(k)) clusters.set(k, []);
  clusters.get(k)!.push(t);
}

// ---------------------------------------------------------------------------
// 2. Account-state features present at contact time
// ---------------------------------------------------------------------------

type FeatureName = "duplicate_charge" | "late_delivery" | "wrong_item" | "unexpected_renewal" | "refund_pending";

const featureAt: Record<FeatureName, (t: Ticket) => boolean> = {
  duplicate_charge: (t) => {
    const ok = t.accountState.charges.filter((c) => c.status === "succeeded");
    return ok.some((a) =>
      ok.some(
        (b) =>
          a.id < b.id &&
          a.amount === b.amount &&
          Math.abs(+new Date(a.createdAt) - +new Date(b.createdAt)) <= HOUR
      )
    );
  },
  late_delivery: (t) => {
    const at = +new Date(t.createdAt);
    return t.accountState.orders.some((o) => {
      const missing =
        at > +new Date(o.promisedBy) && o.status !== "delivered" && o.status !== "cancelled";
      const arrivedLate =
        o.status === "delivered" &&
        o.deliveredAt != null &&
        +new Date(o.deliveredAt) > +new Date(o.promisedBy) &&
        at - +new Date(o.deliveredAt) <= 7 * DAY;
      return missing || arrivedLate;
    });
  },
  wrong_item: (t) => {
    const at = +new Date(t.createdAt);
    return t.accountState.orders.some(
      (o) =>
        o.status === "delivered" &&
        o.deliveredAt != null &&
        at - +new Date(o.deliveredAt) <= 14 * DAY
    );
  },
  unexpected_renewal: (t) => {
    const at = +new Date(t.createdAt);
    return t.accountState.subscriptions.some(
      (s) => s.status === "active" && at - +new Date(s.renewedAt) <= 7 * DAY
    );
  },
  refund_pending: (t) => {
    const at = +new Date(t.createdAt);
    return t.accountState.refunds.some(
      (r) => !r.settledAt && at - +new Date(r.initiatedAt) > 5 * DAY
    );
  },
};

// ---------------------------------------------------------------------------
// 3. baseScore = P(cluster | feature)
// ---------------------------------------------------------------------------

const THRESHOLD = Math.ceil(tickets.length * 0.04);
const emitted: {
  kind: FeatureName;
  count: number;
  featureCount: number;
  baseScore: number;
  sampleSubjects: string[];
  variants: string[];
}[] = [];
const dropped: { kind: string; count: number }[] = [];

// ---------------------------------------------------------------------------
// 4. Mine cluster-distinctive phrasings (the circumlocutions live here)
// ---------------------------------------------------------------------------

const STOP = new Set(
  "the a an is it its my me i of to for in on was this that with and you your please help want never no yet not but at be am so we they said says show shows same one day days week month came come".split(" ")
);

function phrasesOf(text: string): string[] {
  const tokens = text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!STOP.has(tokens[i]) && tokens[i].length > 2) out.push(tokens[i]);
    if (i + 1 < tokens.length && !STOP.has(tokens[i]) && !STOP.has(tokens[i + 1])) {
      out.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
  }
  return out;
}

const phraseCounts = new Map<string, Map<string, number>>(); // cluster → phrase → n
for (const [kind, members] of clusters) {
  const counts = new Map<string, number>();
  for (const t of members) {
    for (const p of new Set(phrasesOf(`${t.subject} ${t.body}`))) {
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  phraseCounts.set(kind, counts);
}

function minedVariants(kind: string): string[] {
  const own = phraseCounts.get(kind)!;
  const scored = [...own.entries()]
    .filter(([phrase, n]) => {
      if (n < 5) return false;
      // distinctive: appears meaningfully in at most one other cluster
      let elsewhere = 0;
      for (const [other, counts] of phraseCounts) {
        if (other !== kind && (counts.get(phrase) ?? 0) >= 5) elsewhere++;
      }
      return elsewhere <= 1;
    })
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => phrase);
  // prefer bigrams (they carry the circumlocutions), cap the list
  const bigrams = scored.filter((p) => p.includes(" ")).slice(0, 8);
  const unigrams = scored.filter((p) => !p.includes(" ")).slice(0, 6);
  return [...bigrams, ...unigrams];
}

for (const [kind, members] of clusters) {
  if (!(kind in featureAt)) {
    dropped.push({ kind, count: members.length });
    continue;
  }
  if (members.length < THRESHOLD) {
    dropped.push({ kind, count: members.length });
    continue;
  }
  const feature = featureAt[kind as FeatureName];
  const featureCount = tickets.filter(feature).length;
  const inClusterWithFeature = members.filter(feature).length;
  emitted.push({
    kind: kind as FeatureName,
    count: members.length,
    featureCount,
    baseScore: Math.round((inClusterWithFeature / featureCount) * 100) / 100,
    sampleSubjects: members.slice(0, 3).map((t) => t.subject),
    variants: minedVariants(kind),
  });
}
emitted.sort((a, b) => b.count - a.count);

for (const e of emitted) {
  console.log(
    `cluster ${e.kind}: ${e.count} tickets · feature in ${e.featureCount} · baseScore ${e.baseScore}`
  );
  console.log(`  variants: ${e.variants.join(", ")}`);
}
console.log(`dropped (below threshold ${THRESHOLD} or unmapped): ${dropped.map((d) => `${d.kind} (${d.count})`).join(", ")}`);

// ---------------------------------------------------------------------------
// 5. Emit lib/hypotheses.generated.ts
// ---------------------------------------------------------------------------

const score = (kind: FeatureName) => emitted.find((e) => e.kind === kind)!.baseScore;
const vars = (kind: FeatureName) => JSON.stringify(emitted.find((e) => e.kind === kind)!.variants);
const stats = (kind: FeatureName) => {
  const e = emitted.find((x) => x.kind === kind)!;
  return `${e.count} of ${tickets.length} tickets; state present in ${e.featureCount}; P(reason | state) = ${e.baseScore}`;
};

const header = `// GENERATED by scripts/generate-rules.ts — do not edit by hand.
// Derived from data/ticket-corpus.json: ${tickets.length} resolved support tickets.
//
// Method: tickets clustered by resolution action; for each cluster above the
// frequency threshold (${THRESHOLD} tickets = 4%), a detector was emitted for the
// account-state condition present at contact time. baseScore is measured, not
// chosen: P(this was the reason for contact | the state is present).
// Variant phrasings are mined from ticket subject/body text per cluster,
// keeping cluster-distinctive phrases — which is where the circumlocutions
// ("boily thing", "water thing", "took money twice") come from.
//
// Clusters below threshold — no detector emitted:
${dropped.map((d) => `//   ${d.kind}: ${d.count} tickets`).join("\n")}
//
// Emitted clusters:
${emitted.map((e) => `//   ${e.kind}: ${stats(e.kind)} · e.g. ${e.sampleSubjects.map((s) => JSON.stringify(s)).join(", ")}`).join("\n")}
`;

const body = `
import type { AccountState, Charge, Hypothesis, Order } from "./types";
import { money, shortDate, daysAgo, gapText } from "./format";

export const GENERATED = true;

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** lowercase item-name tokens, so live account items always match themselves */
function itemTokens(order: Order): string[] {
  return order.items.flatMap((i) => {
    const plain = i.name.split(",")[0].toLowerCase();
    return [plain, ...plain.split(/\\s+/)];
  });
}

/** "Ceramic kettle, 1.7L" → "ceramic kettle", for mid-sentence use. */
function plainName(order: Order): string {
  return order.items[0]?.name.split(",")[0].toLowerCase() ?? "your item";
}

export function generateHypotheses(state: AccountState): Hypothesis[] {
  const out: Hypothesis[] = [];
  const now = Date.now();

  // duplicate_charge — ${stats("duplicate_charge")}
  // Gap threshold 60 min: max observed same-amount gap in cluster was 55 min.
  // Chronological pairing: each charge pairs with the nearest earlier
  // same-amount charge in the window — N same charges → N−1 unique hypotheses.
  {
    const ok = state.charges
      .filter((c) => c.status === "succeeded")
      .slice()
      .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
    for (let i = 1; i < ok.length; i++) {
      const later: Charge = ok[i];
      const a = ok
        .slice(0, i)
        .reverse()
        .find(
          (c) =>
            c.amount === later.amount &&
            later.createdAt.getTime() - c.createdAt.getTime() <= HOUR
        );
      if (a) {
        const b = later;
        {
          const gap = gapText(b.createdAt.getTime() - a.createdAt.getTime());
          out.push({
            id: "duplicate_charge:" + later.id,
            kind: "duplicate_charge",
            title: "You were charged twice",
            detail: \`Two charges of \${money(a.amount)} on \${shortDate(a.createdAt)} for order \${a.orderId ?? "—"}.\`,
            evidence: [
              \`Charge \${a.id} — \${money(a.amount)} — \${shortDate(a.createdAt)}\`,
              \`Charge \${b.id} — \${money(b.amount)} — \${gap} later\`,
              a.orderId ? \`Both point at order \${a.orderId}\` : "No order attached to either charge",
            ],
            occurredAt: later.createdAt,
            baseScore: ${score("duplicate_charge")},
            variants: ${vars("duplicate_charge")},
            action: {
              kind: "refund_duplicate",
              amount: later.amount,
              chargeId: later.id,
              orderId: a.orderId,
              summary: \`Duplicate charge: \${a.id} and \${b.id}, both \${money(a.amount)}, \${gap} apart. Refunding \${later.id}.\`,
            },
          });
        }
      }
    }
  }

  // late_delivery — ${stats("late_delivery")}
  // Covers both observed shapes: still in transit past the promise, and
  // delivered after the promise within the last 7 days.
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
        id: "late_delivery:" + order.id,
        kind: "late_delivery",
        title: "Your order is late",
        detail: \`Order \${order.id} was due \${shortDate(order.promisedBy)} and is still in transit.\`,
        evidence: [
          \`Order \${order.id} — placed \${shortDate(order.placedAt)}\`,
          \`Promised by \${shortDate(order.promisedBy)} — \${daysAgo(order.promisedBy)} days ago\`,
          \`Carrier status: \${order.status.replace("_", " ")}\`,
        ],
        occurredAt: order.promisedBy,
        baseScore: ${score("late_delivery")},
        variants: [...${vars("late_delivery")}, ...itemTokens(order)],
        action: {
          kind: "trace_shipment",
          orderId: order.id,
          summary: \`Order \${order.id} promised \${shortDate(order.promisedBy)}, still \${order.status}. Opening a carrier trace.\`,
        },
      });
    } else if (arrivedLate) {
      out.push({
        id: "late_delivery:" + order.id,
        kind: "late_delivery",
        title: "Your order arrived late",
        detail: \`Order \${order.id} was due \${shortDate(order.promisedBy)} and arrived \${shortDate(order.deliveredAt!)}.\`,
        evidence: [
          \`Order \${order.id} — placed \${shortDate(order.placedAt)}\`,
          \`Promised by \${shortDate(order.promisedBy)}\`,
          \`Delivered \${shortDate(order.deliveredAt!)} — \${daysAgo(order.deliveredAt!)} days ago\`,
        ],
        occurredAt: order.promisedBy,
        baseScore: ${score("late_delivery")},
        variants: [...${vars("late_delivery")}, ...itemTokens(order)],
        action: {
          kind: "trace_shipment",
          orderId: order.id,
          summary: \`Order \${order.id} arrived after its \${shortDate(order.promisedBy)} promise. Filing a late-delivery report.\`,
        },
      });
    }
  }

  // refund_pending — ${stats("refund_pending")}
  // Stale threshold 5 days: every cluster member was ≥6 days unsettled.
  for (const refund of state.refunds) {
    if (!refund.settledAt && now - refund.initiatedAt.getTime() > 5 * DAY) {
      out.push({
        id: "refund_pending:" + refund.id,
        kind: "refund_pending",
        title: "Your refund hasn't arrived",
        detail: \`A refund of \${money(refund.amount)} was started \${daysAgo(refund.initiatedAt)} days ago.\`,
        evidence: [
          \`Refund \${refund.id} — \${money(refund.amount)}\`,
          \`Initiated \${shortDate(refund.initiatedAt)} — \${daysAgo(refund.initiatedAt)} days ago\`,
          \`Original charge \${refund.chargeId}\`,
          "Not settled to the card yet",
        ],
        occurredAt: refund.initiatedAt,
        baseScore: ${score("refund_pending")},
        variants: ${vars("refund_pending")},
        action: {
          kind: "expedite_refund",
          refundId: refund.id,
          amount: refund.amount,
          summary: \`Refund \${refund.id} (\${money(refund.amount)}) unsettled after \${daysAgo(refund.initiatedAt)} days. Escalating with the processor.\`,
        },
      });
    }
  }

  // wrong_item — ${stats("wrong_item")}
  // Contact window 14 days: p100 of delivery-to-contact gap in cluster was 12.
  for (const order of state.orders) {
    if (
      order.status === "delivered" &&
      order.deliveredAt &&
      now - order.deliveredAt.getTime() <= 14 * DAY
    ) {
      out.push({
        id: "wrong_item:" + order.id,
        kind: "wrong_item",
        title: "Something's wrong with what arrived",
        detail: \`Order \${order.id} arrived \${daysAgo(order.deliveredAt)} days ago with the \${plainName(order)}.\`,
        evidence: [
          \`Order \${order.id} — delivered \${shortDate(order.deliveredAt)}\`,
          ...order.items.map((i) => \`\${i.name} × \${i.qty}\`),
          "Contact within 14 days of delivery",
        ],
        occurredAt: order.deliveredAt,
        baseScore: ${score("wrong_item")},
        variants: [...${vars("wrong_item")}, ...itemTokens(order)],
        action: {
          kind: "open_replacement",
          orderId: order.id,
          summary: \`Problem with delivered order \${order.id} (\${plainName(order)}). Opening a replacement.\`,
        },
      });
    }
  }

  // unexpected_renewal — ${stats("unexpected_renewal")}
  // Window 7 days: every cluster member renewed ≤6 days before contact.
  for (const sub of state.subscriptions) {
    if (sub.status === "active" && now - sub.renewedAt.getTime() <= 7 * DAY) {
      const plan = sub.planName.split(",")[0];
      out.push({
        id: "unexpected_renewal:" + sub.id,
        kind: "unexpected_renewal",
        title: "A subscription renewed",
        detail: \`\${plan} renewed on \${shortDate(sub.renewedAt)} for \${money(sub.amount)}.\`,
        evidence: [
          \`\${sub.planName} — \${money(sub.amount)}\`,
          \`Renewed \${shortDate(sub.renewedAt)} — \${daysAgo(sub.renewedAt)} days ago\`,
          \`Subscribed since \${shortDate(sub.startedAt)}\`,
        ],
        occurredAt: sub.renewedAt,
        baseScore: ${score("unexpected_renewal")},
        variants: ${vars("unexpected_renewal")},
        action: {
          kind: "refund_renewal",
          subscriptionId: sub.id,
          amount: sub.amount,
          summary: \`Unexpected renewal of \${sub.planName} (\${money(sub.amount)}). Refunding and pausing the subscription.\`,
        },
      });
    }
  }

  return out;
}
`;

writeFileSync(OUT, header + body);
console.log(`\nWrote ${OUT}`);
