import type { AccountState } from "./types";

type RelativeDate = `-${number}${"d" | "h" | "m" | "s"}`;

type RelativeAccountState = Omit<
  AccountState,
  "orders" | "charges" | "subscriptions" | "refunds" | "priorTickets"
> & {
  orders: Array<
    Omit<
      AccountState["orders"][number],
      "placedAt" | "promisedBy" | "deliveredAt" | "lastTrackingAt"
    > & {
      placedAt: RelativeDate;
      promisedBy?: RelativeDate;
      deliveredAt?: RelativeDate;
      lastTrackingAt?: RelativeDate;
    }
  >;
  charges: Array<
    Omit<AccountState["charges"][number], "createdAt"> & {
      createdAt: RelativeDate;
    }
  >;
  subscriptions: Array<
    Omit<AccountState["subscriptions"][number], "renewedAt"> & {
      renewedAt: RelativeDate;
    }
  >;
  refunds: Array<
    Omit<
      AccountState["refunds"][number],
      "initiatedAt" | "settledAt"
    > & {
      initiatedAt: RelativeDate;
      settledAt?: RelativeDate;
    }
  >;
  priorTickets: Array<
    Omit<AccountState["priorTickets"][number], "createdAt"> & {
      createdAt: RelativeDate;
    }
  >;
};

export const FIXTURE_EMAILS = [
  "maria@example.com",
  "sam@example.com",
  "jo@example.com",
] as const;

export type FixtureEmail = (typeof FIXTURE_EMAILS)[number];

export const DEFAULT_FRAGMENT_BY_EMAIL: Record<FixtureEmail, string> = {
  "maria@example.com": "order wrong the thing help",
  "sam@example.com": "money came again",
  "jo@example.com": "still not here",
};

const fixtureSeeds: Record<FixtureEmail, RelativeAccountState> = {
  "maria@example.com": {
    email: "maria@example.com",
    name: "Maria O.",
    orders: [
      {
        id: "A-4471",
        placedAt: "-6d",
        status: "delivered",
        deliveredAt: "-2d",
        promisedBy: "-3d",
        items: [
          { sku: "KT-118", name: "Ceramic kettle, 1.7L", qty: 1 },
        ],
        total: 8400,
      },
      {
        id: "A-4390",
        placedAt: "-31d",
        status: "delivered",
        deliveredAt: "-27d",
        promisedBy: "-28d",
        items: [
          { sku: "MG-002", name: "Stoneware mug, set of 2", qty: 1 },
        ],
        total: 3200,
      },
    ],
    charges: [
      {
        id: "ch_9001",
        amount: 8400,
        createdAt: "-518400s",
        status: "succeeded",
        orderId: "A-4471",
      },
      {
        id: "ch_9002",
        amount: 8400,
        createdAt: "-518360s",
        status: "succeeded",
        orderId: "A-4471",
      },
      {
        id: "ch_8800",
        amount: 3200,
        createdAt: "-31d",
        status: "succeeded",
        orderId: "A-4390",
      },
    ],
    subscriptions: [],
    refunds: [],
    priorTickets: [
      {
        id: 3312,
        subject: "where is my order",
        createdAt: "-20d",
        status: "solved",
        orderId: "A-4390",
      },
    ],
  },
  "sam@example.com": {
    email: "sam@example.com",
    name: "Sam R.",
    orders: [],
    charges: [],
    subscriptions: [
      {
        id: "sub_2210",
        planName: "Home essentials plan",
        amount: 2400,
        renewedAt: "-3d",
        status: "active",
      },
    ],
    refunds: [
      {
        id: "re_7121",
        amount: 5800,
        initiatedAt: "-9d",
        status: "pending",
        chargeId: "ch_7022",
      },
    ],
    priorTickets: [
      {
        id: 3398,
        subject: "refund still missing",
        createdAt: "-4d",
        status: "pending",
      },
    ],
  },
  "jo@example.com": {
    email: "jo@example.com",
    name: "Jo L.",
    orders: [
      {
        id: "A-4520",
        placedAt: "-11d",
        status: "in_transit",
        promisedBy: "-4d",
        lastTrackingAt: "-5d",
        items: [
          { sku: "LN-410", name: "Linen table runner", qty: 1 },
        ],
        total: 4600,
      },
    ],
    charges: [
      {
        id: "ch_9200",
        amount: 4600,
        createdAt: "-11d",
        status: "succeeded",
        orderId: "A-4520",
      },
    ],
    subscriptions: [],
    refunds: [],
    priorTickets: [
      {
        id: 3411,
        subject: "delivery date passed",
        createdAt: "-2d",
        status: "open",
        orderId: "A-4520",
      },
    ],
  },
};

const cleanSeed: RelativeAccountState = {
  email: "clean@example.com",
  name: "Clean Fixture",
  orders: [
    {
      id: "A-4000",
      placedAt: "-50d",
      status: "delivered",
      promisedBy: "-46d",
      deliveredAt: "-45d",
      items: [{ sku: "PL-010", name: "Dinner plate", qty: 1 }],
      total: 1800,
    },
  ],
  charges: [
    {
      id: "ch_clean",
      amount: 1800,
      createdAt: "-50d",
      status: "succeeded",
      orderId: "A-4000",
    },
  ],
  subscriptions: [],
  refunds: [],
  priorTickets: [],
};

function resolveRelativeDate(value: RelativeDate, now: Date): string {
  const match = /^-(\d+)(d|h|m|s)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid relative date: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const unitMs =
    unit === "d"
      ? 86_400_000
      : unit === "h"
        ? 3_600_000
        : unit === "m"
          ? 60_000
          : 1_000;
  return new Date(now.getTime() - amount * unitMs).toISOString();
}

function resolveSeed(seed: RelativeAccountState, now: Date): AccountState {
  return {
    email: seed.email,
    name: seed.name,
    orders: seed.orders.map((order) => ({
      ...order,
      placedAt: resolveRelativeDate(order.placedAt, now),
      promisedBy: order.promisedBy
        ? resolveRelativeDate(order.promisedBy, now)
        : undefined,
      deliveredAt: order.deliveredAt
        ? resolveRelativeDate(order.deliveredAt, now)
        : undefined,
      lastTrackingAt: order.lastTrackingAt
        ? resolveRelativeDate(order.lastTrackingAt, now)
        : undefined,
    })),
    charges: seed.charges.map((charge) => ({
      ...charge,
      createdAt: resolveRelativeDate(charge.createdAt, now),
    })),
    subscriptions: seed.subscriptions.map((subscription) => ({
      ...subscription,
      renewedAt: resolveRelativeDate(subscription.renewedAt, now),
    })),
    refunds: seed.refunds.map((refund) => ({
      ...refund,
      initiatedAt: resolveRelativeDate(refund.initiatedAt, now),
      settledAt: refund.settledAt
        ? resolveRelativeDate(refund.settledAt, now)
        : undefined,
    })),
    priorTickets: seed.priorTickets.map((ticket) => ({
      ...ticket,
      createdAt: resolveRelativeDate(ticket.createdAt, now),
    })),
  };
}

export function isFixtureEmail(email: string): email is FixtureEmail {
  return FIXTURE_EMAILS.includes(email as FixtureEmail);
}

export function getFixtureAccount(
  email: string = FIXTURE_EMAILS[0],
  now = new Date(),
): AccountState {
  const fixtureEmail = isFixtureEmail(email) ? email : FIXTURE_EMAILS[0];
  return resolveSeed(fixtureSeeds[fixtureEmail], now);
}

export function getCleanFixture(now = new Date()): AccountState {
  return resolveSeed(cleanSeed, now);
}

export const LEGACY_GOLDEN_RESPONSE =
  "Happy to help with your return! You can start a return within 30 days of delivery from the Orders page. Once we receive the item, refunds are processed in 5–7 business days.";

export function normalizeFragment(fragment: string): string {
  return fragment
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isLockedDemoFragment(fragment: string): boolean {
  const normalized = normalizeFragment(fragment);
  return (
    normalized === "" ||
    normalized === "order wrong thing help" ||
    normalized === "order wrong the thing help" ||
    normalized === "the boily thing broke"
  );
}
