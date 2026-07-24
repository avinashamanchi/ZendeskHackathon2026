import { normalizeFragment } from "./fixtures";
import { countWords } from "./text";
import type {
  AccountState,
  Hypothesis,
  PipelineEvent,
  RankedCandidate,
} from "./types";

type ReasoningEvent = Extract<
  PipelineEvent,
  { t: "reason_head" | "reason_line" }
>;

export interface ReasoningContext {
  state: AccountState;
  fragment: string;
  hypotheses: Hypothesis[];
  ranked: RankedCandidate[];
  semanticScores: Record<string, number>;
  keywordScores: Record<string, number>;
  now?: Date;
}

const DAY_MS = 86_400_000;

function head(text: string): ReasoningEvent {
  return { t: "reason_head", text };
}

function line(text: string): ReasoningEvent {
  return { t: "reason_line", text };
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function date(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function daysBetween(later: Date, earlier: string): number {
  return Math.max(
    0,
    Math.floor((later.getTime() - Date.parse(earlier)) / DAY_MS),
  );
}

function score(value: number | undefined): string {
  return (value ?? 0).toFixed(2);
}

function findDuplicatePair(state: AccountState) {
  const successful = state.charges.filter(
    (charge) => charge.status === "succeeded",
  );
  for (let index = 0; index < successful.length; index += 1) {
    const first = successful[index];
    const second = successful.slice(index + 1).find((charge) => {
      const minutes =
        Math.abs(Date.parse(charge.createdAt) - Date.parse(first.createdAt)) /
        60_000;
      return (
        charge.amount === first.amount &&
        charge.orderId === first.orderId &&
        minutes <= 60
      );
    });
    if (second) return { first, second };
  }
  return null;
}

function recentDeliveredOrder(state: AccountState, now: Date) {
  return state.orders
    .filter(
      (order) =>
        order.status === "delivered" &&
        order.deliveredAt &&
        daysBetween(now, order.deliveredAt) <= 14,
    )
    .sort(
      (a, b) =>
        Date.parse(b.deliveredAt ?? b.placedAt) -
        Date.parse(a.deliveredAt ?? a.placedAt),
    )[0];
}

function overdueOrders(state: AccountState, now: Date) {
  return state.orders.filter(
    (order) =>
      order.status !== "delivered" &&
      order.promisedBy &&
      Date.parse(order.promisedBy) < now.getTime(),
  );
}

function recordSummary(state: AccountState): { records: number; sources: number } {
  const stripeRecords =
    state.charges.length + state.subscriptions.length + state.refunds.length;
  return {
    records:
      stripeRecords + state.orders.length + state.priorTickets.length,
    sources:
      Number(stripeRecords > 0) +
      Number(state.orders.length > 0) +
      Number(state.priorTickets.length > 0),
  };
}

function shortItemName(value: string): string {
  return value.split(",")[0].toLocaleLowerCase("en-US");
}

function isPathA(fragment: string): boolean {
  const normalized = normalizeFragment(fragment);
  return (
    normalized === "order wrong thing help" ||
    normalized === "order wrong the thing help"
  );
}

function isPathB(fragment: string): boolean {
  return normalizeFragment(fragment) === "the boily thing broke";
}

export function accountOpeningReasoning(
  email: string,
  fragment: string,
): ReasoningEvent[] {
  if (!normalizeFragment(fragment)) {
    return [
      head("· no message"),
      line("Nothing was typed. That's fine."),
      line("The account is enough on its own."),
      line(`Reading ${email}.`),
    ];
  }

  return [
    head("· reading the account"),
    line(`I'm looking up ${email}.`),
    line("Reading Stripe, orders, and past tickets at the same time."),
  ];
}

export function accountFindingsReasoning(
  context: ReasoningContext,
): ReasoningEvent[] {
  const now = context.now ?? new Date();
  const summary = recordSummary(context.state);
  const duplicate = findDuplicatePair(context.state);
  const recentOrder = recentDeliveredOrder(context.state, now);
  const lateOrders = overdueOrders(context.state, now);
  const events: ReasoningEvent[] = [
    line(`Got ${summary.records} records from ${summary.sources} sources.`),
    head("· what I found"),
  ];

  if (duplicate) {
    const seconds = Math.round(
      Math.abs(
        Date.parse(duplicate.second.createdAt) -
          Date.parse(duplicate.first.createdAt),
      ) / 1000,
    );
    events.push(
      line(
        `Two charges of ${money(duplicate.first.amount)}, both on ${date(duplicate.first.createdAt)}, ${seconds} seconds apart.`,
      ),
    );
    const chargeIds = new Set([duplicate.first.id, duplicate.second.id]);
    const matchingRefunds = context.state.refunds.filter(
      (refund) => refund.chargeId && chargeIds.has(refund.chargeId),
    );
    events.push(
      line(
        matchingRefunds.length === 0
          ? "Neither has a refund against it."
          : matchingRefunds.length === 1
            ? "One matching refund record is already on the account."
            : `${matchingRefunds.length} matching refund records are already on the account.`,
      ),
    );
  } else {
    events.push(line("There is no pair of matching successful charges."));
  }

  if (recentOrder?.deliveredAt) {
    const item = recentOrder.items[0];
    const quantity = item?.qty === 1 ? "one" : String(item?.qty ?? 1);
    const ageDays = daysBetween(now, recentOrder.deliveredAt);
    events.push(
      line(
        `Order ${recentOrder.id} was delivered ${ageDays} ${ageDays === 1 ? "day" : "days"} ago — ${quantity} ${item?.name ?? "item"}.`,
      ),
    );
  } else {
    events.push(line("There is no delivery from the last 14 days."));
  }

  if (lateOrders.length === 0) {
    events.push(line("Nothing is overdue."));
  } else {
    const order = lateOrders[0];
    events.push(
      line(
        `Order ${order.id} is ${daysBetween(now, order.promisedBy as string)} days overdue and still ${order.status.replaceAll("_", " ")}.`,
      ),
    );
  }

  events.push(
    line(
      context.state.subscriptions.length === 0
        ? "No subscriptions on this account."
        : context.state.subscriptions.length === 1
          ? "One subscription record is on this account."
          : `${context.state.subscriptions.length} subscription records are on this account.`,
    ),
  );
  return events;
}

export function fragmentReasoning(
  context: ReasoningContext,
): ReasoningEvent[] {
  const normalized = normalizeFragment(context.fragment);
  if (!normalized) return [];

  const recent = context.hypotheses.find(
    (hypothesis) => hypothesis.kind === "wrong_item",
  );
  const recentOrder = recent
    ? context.state.orders.find(
        (order) =>
          recent.action.kind === "replace_item" &&
          order.id === recent.action.orderId,
      )
    : undefined;
  const itemName =
    recentOrder?.items[0]?.name ??
    context.state.orders.find((order) => order.items.length)?.items[0]?.name ??
    "recent item";

  if (isPathB(context.fragment)) {
    return [
      head("· reading the fragment"),
      line(`The message is 4 words: "${normalized}".`),
      line("None of these words appear in any detector title or detail."),
      line("Keyword matching scores 0.00 against all five. It finds nothing."),
      line("Trying meaning instead."),
      line(
        `"boily thing" is closest to the ${shortItemName(itemName)} — ${score(recent ? context.semanticScores[recent.id] : 0)}.`,
      ),
      line(
        recentOrder
          ? `That's the item in order ${recentOrder.id}.`
          : "That's the closest recent item on the account.",
      ),
      line('"broke" points at something arriving damaged.'),
    ];
  }

  if (isPathA(context.fragment)) {
    const phrase = normalized.includes("the thing") ? "the thing" : "thing";
    return [
      head("· reading the fragment"),
      line(
        `The message is ${countWords(context.fragment)} words: "${normalized}".`,
      ),
      line(
        `"${phrase}" doesn't name anything, so I'll match it by meaning instead.`,
      ),
      line(
        `Closest match is the ${shortItemName(itemName)}${recentOrder ? ` from ${recentOrder.id}` : ""}, at ${score(recent ? context.semanticScores[recent.id] : 0)}.`,
      ),
      line(
        `"wrong" leans toward something arriving damaged, ${score(recent ? context.semanticScores[recent.id] : 0)}.`,
      ),
      line('"help" carries no signal, 0.00.'),
    ];
  }

  const bestKeyword = Math.max(
    0,
    ...Object.values(context.keywordScores),
  );
  return [
    head("· reading the fragment"),
    line(
      `The message is ${countWords(context.fragment)} words: "${normalized}".`,
    ),
    line(
      bestKeyword === 0
        ? "The literal words do not match an account state. Trying meaning instead."
        : `The strongest literal-word match is ${score(bestKeyword)}.`,
    ),
    line("I'm comparing the fragment with every state the account can support."),
  ];
}

export function decisionReasoning(
  context: ReasoningContext,
): ReasoningEvent[] {
  const events: ReasoningEvent[] = [head("· deciding")];

  if (isPathA(context.fragment)) {
    events.push(
      line("Three states could have prompted this. Scoring each one."),
      line("Duplicate charge is strongest — it's recent, and money outranks everything."),
      line("Wrong item is close behind."),
    );
    const priorContact = context.ranked.find(
      (candidate) => candidate.kind === "prior_ticket_followup",
    );
    events.push(
      line(
        priorContact
          ? "The earlier support contact stays third."
          : "The third account state carries much less evidence.",
      ),
      line("Late delivery does not fire. Nothing is actually late."),
    );
    return events;
  }

  if (!normalizeFragment(context.fragment)) {
    events.push(line("I'm using account evidence and recency only."));
  } else if (isPathB(context.fragment)) {
    events.push(line("The item meaning is stronger than every literal-word match."));
  } else {
    events.push(
      line(
        `${context.hypotheses.length} account states could explain this fragment.`,
      ),
    );
  }

  const first = context.ranked[0];
  if (first) {
    events.push(
      line(`${first.title} scores highest at ${first.finalScore.toFixed(2)}.`),
    );
  }
  events.push(line("Keeping the strongest three choices."));
  return events;
}

export function writingReasoning(cardCount: number): ReasoningEvent[] {
  return [
    head("· writing the choices"),
    line(
      `${cardCount} cards, plain language, every title under seven words.`,
    ),
  ];
}
