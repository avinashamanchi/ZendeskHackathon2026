import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { AccountState } from "../lib/types";

const FIXED_NOW = Date.parse("2026-04-15T12:00:00.000Z");
const DAY_MS = 86_400_000;
const SEED = 0x574f5244;
const RECORDS_PER_KIND = 64;

const resolutionKinds = [
  "duplicate_charge",
  "wrong_item",
  "late_delivery",
  "unexpected_renewal",
  "refund_pending",
  "clean_state",
] as const;

const styles = [
  "fragment",
  "misspelling",
  "circumlocution",
  "fluent",
] as const;

type ResolutionKind = (typeof resolutionKinds)[number];
type TicketStyle = (typeof styles)[number];
type ActionKind =
  | "refund_duplicate"
  | "replace_item"
  | "trace_delivery"
  | "review_renewal"
  | "trace_refund"
  | null;

interface TicketRecord {
  ticketId: string;
  fictional: true;
  style: TicketStyle;
  channel: "chat" | "email" | "web";
  receivedAt: string;
  customerText: {
    subject: string;
    body: string;
  };
  accountStateAtContact: AccountState;
  expectedResolution: {
    kind: ResolutionKind;
    detectorKind: Exclude<ResolutionKind, "clean_state"> | null;
    actionKind: ActionKind;
    summary: string;
  };
}

interface TextContext {
  amount: string;
  item: string;
  order: string;
  plan: string;
  days: string;
}

type TextBank = Record<
  ResolutionKind,
  Record<TicketStyle, { subjects: string[]; bodies: string[] }>
>;

const textBank: TextBank = {
  duplicate_charge: {
    fragment: {
      subjects: ["same charge twice", "card. two times.", "money twice"],
      bodies: [
        "order {{order}}. {{amount}} then {{amount}} again. help.",
        "bank shows two. same money. same order.",
        "paid already. card took it twice.",
        "two lines. {{amount}}. both today.",
      ],
    },
    misspelling: {
      subjects: ["chaged two tmes", "duble payment", "same chrge agin"],
      bodies: [
        "I got chaged {{amount}} two tmes for {{order}}.",
        "My bak app has the same paymant twice, can u chek?",
        "It tuk the mony again even tho I alredy paid.",
        "There r 2 card chargs for one oder.",
      ],
    },
    circumlocution: {
      subjects: ["the money thing repeated", "two matching bank lines", "it took it again"],
      bodies: [
        "The place where my card money appears has the same {{amount}} line two times.",
        "I only bought one thing, but the number under the purchase is there again right below it.",
        "The money left once like it should, then the exact same amount left another time.",
        "For {{order}}, the bank-side list looks copied: one purchase, two payments.",
      ],
    },
    fluent: {
      subjects: ["Duplicate charge for {{order}}", "Two identical card charges", "Billing correction requested"],
      bodies: [
        "My statement shows two successful charges of {{amount}} for order {{order}}, but I placed only one order.",
        "I was billed twice for the same purchase. Please refund the duplicate charge.",
        "There are two identical transactions for {{order}} within the same hour; only one is valid.",
        "Could you review the duplicated {{amount}} payment and reverse the second transaction?",
      ],
    },
  },
  wrong_item: {
    fragment: {
      subjects: ["wrong thing came", "item broke", "need another one"],
      bodies: [
        "{{item}}. arrived cracked. replace?",
        "order {{order}} wrong one. need right one.",
        "the thing that came. handle broken.",
        "opened box. not usable. help new one.",
      ],
    },
    misspelling: {
      subjects: ["it arived brokn", "rong item", "replacment pls"],
      bodies: [
        "The {{item}} arived with a crack and I need a replacment.",
        "Order {{order}} has the rong thing in the box.",
        "It dosnt work out of the pakage. can u send anuther?",
        "The handels brokn on the thing that came yesturday.",
      ],
    },
    circumlocution: {
      subjects: ["the thing from the last box", "the tea-water item", "what arrived is not right"],
      bodies: [
        "The {{item}}, the thing I use to make the water hot, came with a piece split off.",
        "What was inside the newest delivery is not the version I chose on the picture.",
        "I need another of the thing from {{order}} because this one cannot be used safely.",
        "The object that arrived most recently has the wrong part where the handle should be.",
      ],
    },
    fluent: {
      subjects: ["Replacement for {{item}}", "Incorrect item in {{order}}", "Recent delivery arrived damaged"],
      bodies: [
        "The {{item}} in order {{order}} arrived damaged, so I would like a replacement.",
        "I received a different model than the one listed on my recent order. Please send the correct item.",
        "My newest delivery has a broken handle and cannot be used; could you arrange a replacement?",
        "The package arrived, but its item is defective and I need the same product in working condition.",
      ],
    },
  },
  late_delivery: {
    fragment: {
      subjects: ["still not here", "order late", "where package"],
      bodies: [
        "{{order}} due {{days}} days ago. nothing.",
        "tracking says moving. no box yet.",
        "was meant to come. still waiting.",
        "delivery date passed. need help.",
      ],
    },
    misspelling: {
      subjects: ["delivry late", "pakage not hear", "wheres my oder"],
      bodies: [
        "My pakage was due {{days}} days ago but its not hear.",
        "Order {{order}} stil says in trasit after the delivry date.",
        "I havnt got the box and the date alredy past.",
        "Can u chek were my oder is? it shuld be here.",
      ],
    },
    circumlocution: {
      subjects: ["the box that never came", "past the day on the tracker", "waiting for the delivery thing"],
      bodies: [
        "The day the tracking page said I would have it has gone by, but there is no package.",
        "The thing carrying {{order}} still says it is between places even though it should be at my door.",
        "I keep looking outside for the box that was meant to arrive {{days}} days ago.",
        "The progress line has not reached delivered and the promised day is already behind us.",
      ],
    },
    fluent: {
      subjects: ["Late delivery for {{order}}", "Order has missed its delivery date", "Please trace my shipment"],
      bodies: [
        "Order {{order}} was promised {{days}} days ago and remains in transit. Please trace the delivery.",
        "My shipment has passed its expected delivery date, and I have not received an updated arrival estimate.",
        "The tracking page still shows in transit even though the package should already have arrived.",
        "Could you locate my overdue shipment and tell me when it is likely to arrive?",
      ],
    },
  },
  unexpected_renewal: {
    fragment: {
      subjects: ["plan charged again", "monthly thing back", "did not want renewal"],
      bodies: [
        "{{plan}}. {{amount}} again. stop.",
        "money came out for plan. did not ask.",
        "renewed yesterday. don't need it.",
        "same monthly payment back. help cancel.",
      ],
    },
    misspelling: {
      subjects: ["subscrption chrged", "unwantd renewl", "plan took mony agin"],
      bodies: [
        "The subscribtion renewd and took {{amount}} but I dont want it.",
        "I thot I cancled {{plan}} and it chaged me agin.",
        "Why did the monthy plan renew? plese chek it.",
        "This renewl wasnt expexted and I need help stoping it.",
      ],
    },
    circumlocution: {
      subjects: ["the repeating plan came back", "money for another month", "the automatic thing happened"],
      bodies: [
        "The thing that pays itself each month took {{amount}} again, and I did not mean to keep it.",
        "I thought the repeating home-items arrangement was finished, but another month appeared on my card.",
        "The automatic part turned itself on for a new period when I expected it to stop.",
        "There is a new payment for the plan that sends things regularly, which I no longer need.",
      ],
    },
    fluent: {
      subjects: ["Unexpected {{plan}} renewal", "Subscription renewed after cancellation", "Review recent plan charge"],
      bodies: [
        "My {{plan}} renewed for {{amount}}, but I did not intend to continue the subscription.",
        "I expected this subscription to end before the next billing date, yet it renewed this week.",
        "Please review the latest renewal and help me stop future recurring charges.",
        "A new subscription payment appeared even though I believed the plan was no longer active.",
      ],
    },
  },
  refund_pending: {
    fragment: {
      subjects: ["money not back", "refund missing", "still waiting refund"],
      bodies: [
        "refund started {{days}} days. nothing in bank.",
        "{{amount}} coming back? not there.",
        "return done. money still gone.",
        "refund says pending. too long.",
      ],
    },
    misspelling: {
      subjects: ["refnd not here", "wating for mony", "retun money mising"],
      bodies: [
        "My refnd was startd {{days}} days ago but the mony isnt back.",
        "Im stil wating for {{amount}} from the retun.",
        "The app says pendng and my bak has not got it.",
        "Can u chek the refun? its takng a long time.",
      ],
    },
    circumlocution: {
      subjects: ["the money coming back is absent", "after I sent it back", "waiting for the reverse payment"],
      bodies: [
        "The money that was supposed to travel back to my card has not shown up after {{days}} days.",
        "I returned the item, and the number that should be added back to my bank is still missing.",
        "The payment is meant to go in the other direction now, but it seems stuck at pending.",
        "I was told {{amount}} would come back, and I cannot find it anywhere on the card page.",
      ],
    },
    fluent: {
      subjects: ["Pending refund of {{amount}}", "Refund has not reached my account", "Please trace my refund"],
      bodies: [
        "My {{amount}} refund was initiated {{days}} days ago and still has not reached my account.",
        "The refund remains pending well beyond the expected processing window. Could you trace it?",
        "I completed the return, but the corresponding credit has not appeared on my card statement.",
        "Please check the status of my refund and confirm whether the bank has received it.",
      ],
    },
  },
  clean_state: {
    fragment: {
      subjects: ["is it done", "money came back", "checking status"],
      bodies: [
        "refund shows settled. just checking.",
        "box here. charge once. all okay?",
        "money back now. nothing else.",
        "order done. no more help needed.",
      ],
    },
    misspelling: {
      subjects: ["just cheking", "refnd arived", "oder all good"],
      bodies: [
        "The refnd is in my bak now, I am just cheking its closed.",
        "My pakage arived and theres only one chrge.",
        "Looks settld now. no acton needd.",
        "I got the mony back so this can be closd.",
      ],
    },
    circumlocution: {
      subjects: ["the money returned", "the box is with me now", "the account looks quiet"],
      bodies: [
        "The number that left my card has come back, so I only want to make sure the matter is finished.",
        "The thing I was waiting for is at my door now and the bank list has only one payment.",
        "Everything on the page looks settled; I do not see anything that still needs to be moved.",
        "What was missing before is here now, and I am writing only to confirm the case can end.",
      ],
    },
    fluent: {
      subjects: ["Confirm resolved status", "Refund received successfully", "No further action required"],
      bodies: [
        "The refund has reached my account, so no further action is required. Please mark the issue resolved.",
        "My order arrived and the statement contains only the expected charge; I am confirming that everything is settled.",
        "The earlier issue is resolved now. I only need confirmation that the support case is closed.",
        "All account activity looks correct, and I do not need a refund, replacement, or delivery trace.",
      ],
    },
  },
};

const summaries: Record<ResolutionKind, string> = {
  duplicate_charge: "Confirm the duplicate transaction and offer a refund of the second charge.",
  wrong_item: "Identify the recent delivered item and offer a replacement.",
  late_delivery: "Confirm the missed promise date and offer to trace the delivery.",
  unexpected_renewal: "Identify the recent renewal and offer a subscription review.",
  refund_pending: "Confirm the overdue pending refund and offer to trace it.",
  clean_state: "Explain that the account is settled and do not propose an unsupported action.",
};

const actionByKind: Record<ResolutionKind, ActionKind> = {
  duplicate_charge: "refund_duplicate",
  wrong_item: "replace_item",
  late_delivery: "trace_delivery",
  unexpected_renewal: "review_renewal",
  refund_pending: "trace_refund",
  clean_state: null,
};

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

const random = createRandom(SEED);

function pick<T>(values: readonly T[]): T {
  return values[Math.floor(random() * values.length)];
}

function isoDaysAgo(days: number, minuteOffset = 0): string {
  return new Date(FIXED_NOW - days * DAY_MS + minuteOffset * 60_000).toISOString();
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function interpolate(template: string, context: TextContext): string {
  return template.replace(/\{\{(amount|item|order|plan|days)\}\}/g, (_, key: keyof TextContext) => context[key]);
}

function buildAccount(kind: ResolutionKind, serial: number): { state: AccountState; context: TextContext } {
  const padded = serial.toString().padStart(4, "0");
  const orderId = `S-${padded}`;
  const amount = pick([3200, 4800, 5800, 7200, 8400, 9600]);
  const item = pick([
    "ceramic kettle",
    "glass tea pot",
    "pour-over brewer",
    "stoneware mug set",
    "insulated carafe",
    "electric milk frother",
  ]);
  const plan = pick(["Home essentials plan", "Tea club plan", "Kitchen care plan"]);
  const ageDays = pick([2, 3, 4, 6, 8, 9]);
  const base: AccountState = {
    email: `ticket-${padded}@example.invalid`,
    name: `Fictional customer ${padded}`,
    orders: [],
    charges: [],
    subscriptions: [],
    refunds: [],
    priorTickets: [],
  };

  if (kind === "duplicate_charge") {
    base.orders.push({
      id: orderId,
      placedAt: isoDaysAgo(6),
      status: "delivered",
      promisedBy: isoDaysAgo(3),
      deliveredAt: isoDaysAgo(2),
      items: [{ sku: `SKU-${padded}`, name: item, qty: 1 }],
      total: amount,
    });
    base.charges.push(
      { id: `ch_${padded}a`, amount, createdAt: isoDaysAgo(6), status: "succeeded", orderId },
      { id: `ch_${padded}b`, amount, createdAt: isoDaysAgo(6, 24), status: "succeeded", orderId },
    );
  } else if (kind === "wrong_item") {
    base.orders.push({
      id: orderId,
      placedAt: isoDaysAgo(6),
      status: "delivered",
      promisedBy: isoDaysAgo(3),
      deliveredAt: isoDaysAgo(2),
      items: [{ sku: `SKU-${padded}`, name: item, qty: 1 }],
      total: amount,
    });
    base.charges.push({ id: `ch_${padded}`, amount, createdAt: isoDaysAgo(6), status: "succeeded", orderId });
  } else if (kind === "late_delivery") {
    base.orders.push({
      id: orderId,
      placedAt: isoDaysAgo(12),
      status: "in_transit",
      promisedBy: isoDaysAgo(ageDays),
      lastTrackingAt: isoDaysAgo(2),
      items: [{ sku: `SKU-${padded}`, name: item, qty: 1 }],
      total: amount,
    });
    base.charges.push({ id: `ch_${padded}`, amount, createdAt: isoDaysAgo(12), status: "succeeded", orderId });
  } else if (kind === "unexpected_renewal") {
    base.subscriptions.push({
      id: `sub_${padded}`,
      planName: plan,
      amount,
      renewedAt: isoDaysAgo(2),
      status: "active",
    });
  } else if (kind === "refund_pending") {
    base.refunds.push({
      id: `re_${padded}`,
      amount,
      initiatedAt: isoDaysAgo(Math.max(8, ageDays)),
      status: "pending",
      chargeId: `ch_${padded}`,
    });
  } else {
    base.orders.push({
      id: orderId,
      placedAt: isoDaysAgo(30),
      status: "delivered",
      promisedBy: isoDaysAgo(26),
      deliveredAt: isoDaysAgo(25),
      items: [{ sku: `SKU-${padded}`, name: item, qty: 1 }],
      total: amount,
    });
    base.charges.push({ id: `ch_${padded}`, amount, createdAt: isoDaysAgo(30), status: "succeeded", orderId });
    base.refunds.push({
      id: `re_${padded}`,
      amount,
      initiatedAt: isoDaysAgo(12),
      settledAt: isoDaysAgo(4),
      status: "settled",
      chargeId: `ch_${padded}`,
    });
  }

  return {
    state: base,
    context: {
      amount: dollars(amount),
      item,
      order: orderId,
      plan,
      days: String(Math.max(8, ageDays)),
    },
  };
}

function buildRecord(kind: ResolutionKind, indexWithinKind: number, serial: number): TicketRecord {
  const style = styles[indexWithinKind % styles.length];
  const { state, context } = buildAccount(kind, serial);
  const bank = textBank[kind][style];
  const padded = serial.toString().padStart(4, "0");

  return {
    ticketId: `POINT-${padded}`,
    fictional: true,
    style,
    channel: pick(["chat", "email", "web"] as const),
    receivedAt: isoDaysAgo(1 + (serial % 45), serial % 60),
    customerText: {
      subject: interpolate(pick(bank.subjects), context),
      body: interpolate(pick(bank.bodies), context),
    },
    accountStateAtContact: state,
    expectedResolution: {
      kind,
      detectorKind: kind === "clean_state" ? null : kind,
      actionKind: actionByKind[kind],
      summary: summaries[kind],
    },
  };
}

async function main(): Promise<void> {
  const records: TicketRecord[] = [];
  let serial = 1;

  for (const kind of resolutionKinds) {
    for (let index = 0; index < RECORDS_PER_KIND; index += 1) {
      records.push(buildRecord(kind, index, serial));
      serial += 1;
    }
  }

  const corpus = {
    schemaVersion: "wordless-ticket-corpus.v1",
    description: "Deterministic, wholly fictional support tickets for offline rule provenance and regression evaluation.",
    seed: `0x${SEED.toString(16).toUpperCase()}`,
    fixedSnapshotAt: new Date(FIXED_NOW).toISOString(),
    recordsPerKind: RECORDS_PER_KIND,
    records,
  };

  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const outputDirectory = path.resolve(scriptDirectory, "../data");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "ticket-corpus.json"),
    `${JSON.stringify(corpus, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(`Wrote ${records.length} fictional tickets to data/ticket-corpus.json\n`);
}

await main();
