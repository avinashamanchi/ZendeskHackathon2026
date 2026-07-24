// The full data contract for Point.
// AccountState is the merchant's records about their own customer — the thing
// that is unambiguous when the person's words are not.

export type OrderStatus = "processing" | "in_transit" | "delivered" | "cancelled";

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
}

export interface Order {
  id: string;
  placedAt: Date;
  status: OrderStatus;
  promisedBy: Date;
  deliveredAt?: Date;
  items: OrderItem[];
  /** cents */
  total: number;
}

export interface Charge {
  id: string;
  /** cents */
  amount: number;
  createdAt: Date;
  status: "succeeded" | "pending" | "failed";
  orderId?: string;
}

export interface Subscription {
  id: string;
  planName: string;
  /** cents */
  amount: number;
  startedAt: Date;
  renewedAt: Date;
  status: "active" | "cancelled";
}

export interface Refund {
  id: string;
  /** cents */
  amount: number;
  initiatedAt: Date;
  settledAt?: Date;
  chargeId: string;
}

export interface PriorTicket {
  id: number;
  subject: string;
  createdAt: Date;
  status: "open" | "solved" | "closed";
}

export interface AccountState {
  email: string;
  name: string;
  orders: Order[];
  charges: Charge[];
  subscriptions: Subscription[];
  refunds: Refund[];
  priorTickets: PriorTicket[];
}

export type ActionKind =
  | "refund_duplicate"
  | "open_replacement"
  | "trace_shipment"
  | "refund_renewal"
  | "expedite_refund";

export interface ActionSpec {
  kind: ActionKind;
  /** cents, when money moves */
  amount?: number;
  orderId?: string;
  chargeId?: string;
  subscriptionId?: string;
  refundId?: string;
  /** one line for the Zendesk ticket body */
  summary: string;
}

export interface Hypothesis {
  id: string;
  kind: string;
  /** plain language, 3–7 words, second person */
  title: string;
  /** one sentence, <20 words, with a concrete number/date/name */
  detail: string;
  /** raw facts, shown behind the "why this?" disclosure */
  evidence: string[];
  /** when the anomaly happened — drives the recency boost */
  occurredAt: Date;
  /** 0–1, how strongly this state predicts contact */
  baseScore: number;
  /** circumlocution phrasings, embedded for semantic matching */
  variants: string[];
  action: ActionSpec;
}

/** How the semantic score was obtained, most-preferred first. */
export type MatchSource = "octen" | "precomputed" | "keyword" | "none";

/** JSON-safe hypothesis + score, as returned by /api/resolve. */
export interface Candidate {
  id: string;
  kind: string;
  title: string;
  detail: string;
  evidence: string[];
  occurredAt: string; // ISO
  finalScore: number;
  scores: { base: number; recency: number; semantic: number };
  action: ActionSpec;
}

export interface ResolveResponse {
  candidates: Candidate[];
  /** the legacy RAG agent's fluent, confident, wrong reply */
  legacy: string;
  matchedBy: MatchSource;
  customer: { email: string; name: string };
}

export interface ActReceipt {
  /** e.g. "Done. Refund of $84.00 sent." */
  headline: string;
  /** e.g. "Stripe refund re_demo_9002 · Zendesk ticket #4471 closed" */
  detail: string;
  refundId?: string;
  ticketId?: string;
  mode: "live" | "demo";
}
