export type ISODateString = string;

export type OrderStatus =
  | "processing"
  | "in_transit"
  | "delivered"
  | "returned";

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
}

export interface Order {
  id: string;
  placedAt: ISODateString;
  status: OrderStatus;
  promisedBy?: ISODateString;
  deliveredAt?: ISODateString;
  lastTrackingAt?: ISODateString;
  items: OrderItem[];
  total: number;
}

export interface Charge {
  id: string;
  amount: number;
  createdAt: ISODateString;
  status: "succeeded" | "pending" | "failed";
  orderId: string;
}

export interface Subscription {
  id: string;
  planName: string;
  amount: number;
  renewedAt: ISODateString;
  status: "active" | "cancelled" | "paused";
}

export interface Refund {
  id: string;
  amount: number;
  initiatedAt: ISODateString;
  status: "pending" | "settled" | "failed";
  chargeId?: string;
  settledAt?: ISODateString;
}

export interface PriorTicket {
  id: number;
  subject: string;
  createdAt: ISODateString;
  status: "open" | "pending" | "solved" | "closed";
  orderId?: string;
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

export type ActionSpec =
  | {
      kind: "refund_duplicate";
      label: string;
      chargeId: string;
      orderId: string;
      amount: number;
    }
  | {
      kind: "replace_item";
      label: string;
      orderId: string;
      sku: string;
      itemName: string;
    }
  | {
      kind: "trace_delivery";
      label: string;
      orderId: string;
    }
  | {
      kind: "review_renewal";
      label: string;
      subscriptionId: string;
      amount: number;
    }
  | {
      kind: "trace_refund";
      label: string;
      refundId: string;
      amount: number;
    }
  | {
      kind: "continue_ticket";
      label: string;
      ticketId: number;
    }
  | {
      kind: "escalate_support";
      label: string;
      fragment: string;
    };

export interface Hypothesis {
  id: string;
  kind: string;
  title: string;
  detail: string;
  evidence: string[];
  occurredAt: ISODateString;
  baseScore: number;
  variants: string[];
  action: ActionSpec;
}

export interface RankedCandidate extends Hypothesis {
  semanticScore: number;
  recencyBoost: number;
  finalScore: number;
}

export interface CandidateView {
  id: string;
  kind: string;
  title: string;
  detail: string;
  evidence: string[];
  occurredAt: ISODateString;
  actionLabel: string;
  actionToken: string;
}

export type ProviderSource = "fixture" | "live" | "fallback" | "skipped";

export interface ResolveResponse {
  requestId: string;
  email: string;
  accountName: string;
  legacy: string;
  candidates: CandidateView[];
  status: string;
  requestedMode: "demo" | "live";
  mode: "demo" | "live" | "fallback";
  providers: {
    composio: ProviderSource;
    octen: ProviderSource;
    openai: ProviderSource;
  };
}

export interface ActionReceipt {
  status: "completed" | "not_completed";
  title: string;
  detail: string;
  reference: string;
  source: ProviderSource;
}

export type PipelineTool = "composio" | "octen" | "codex" | "zendesk";

export type PipelineStageState =
  | "running"
  | "done"
  | "fixtures"
  | "fallback"
  | "skipped";

export type PipelineEvent =
  | {
      t: "stage_start";
      tool: PipelineTool;
      label: string;
      source: ProviderSource;
      state: "running";
      simulated: boolean;
    }
  | {
      t: "stage_done";
      tool: PipelineTool;
      ms: number;
      summary: string;
      source: ProviderSource;
      state: Exclude<PipelineStageState, "running">;
      simulated: boolean;
    }
  | { t: "reason_head"; text: string }
  | { t: "reason_line"; text: string }
  | {
      t: "evidence";
      source: string;
      line: string;
      raw: Record<string, unknown>;
      hit: boolean;
    }
  | {
      t: "hypothesis";
      kind: string;
      base: number;
      recency: number;
      semantic: number;
      total: number;
      fired: boolean;
      why: string;
    }
  | {
      t: "semantic";
      token: string;
      target: string;
      keyword: number;
      octen: number;
    }
  | {
      t: "candidates";
      cards: CandidateView[];
      response: ResolveResponse;
    }
  | {
      t: "error";
      tool: PipelineTool;
      recovered: true;
      source: "fallback";
      state: "fallback";
    };
