import { getFixtureAccount } from "./fixtures";
import { fixtureReceipt } from "./demo";
import type {
  AccountState,
  ActionReceipt,
  ActionSpec,
  Charge,
  Order,
  PriorTicket,
  ProviderSource,
  Refund,
  Subscription,
} from "./types";

export const COMPOSIO_READ_TOOLS = {
  shopify: ["SHOPIFY_GET_CUSTOMERS_SEARCH", "SHOPIFY_GET_CUSTOMER_ORDERS"],
  stripe: [
    "STRIPE_LIST_CUSTOMERS",
    "STRIPE_LIST_CHARGES",
    "STRIPE_LIST_SUBSCRIPTIONS",
    "STRIPE_LIST_REFUNDS",
  ],
  zendesk: [
    "ZENDESK_SEARCH_ZENDESK_USERS",
    "ZENDESK_GET_USERS_REQUESTED_TICKETS",
  ],
} as const;

export const COMPOSIO_WRITE_TOOLS = {
  stripe: ["STRIPE_CREATE_REFUND"],
  zendesk: [
    "ZENDESK_CREATE_ZENDESK_TICKET",
    "ZENDESK_UPDATE_ZENDESK_TICKET",
  ],
} as const;

interface ComposioConfig {
  apiKey: string;
  merchantUserId: string;
  shopifyAccountId: string;
  stripeAccountId: string;
  zendeskAccountId: string;
}

interface ToolSession {
  execute(
    slug: string,
    arguments_?: Record<string, unknown>,
    options?: Record<string, unknown>,
    requestOptions?: { signal?: AbortSignal },
  ): Promise<{ data: Record<string, unknown>; error: string | null; logId?: string }>;
}

let readSessionPromise: Promise<ToolSession> | null = null;
let writeSessionPromise: Promise<ToolSession> | null = null;
const actionLedger = new Map<string, ActionReceipt>();

function configuredTimeout(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value >= 500 && value <= 30_000
    ? Math.round(value)
    : fallback;
}

function composioConfig(): ComposioConfig {
  const config = {
    apiKey: process.env.COMPOSIO_API_KEY,
    merchantUserId: process.env.COMPOSIO_MERCHANT_USER_ID,
    shopifyAccountId: process.env.COMPOSIO_SHOPIFY_CONNECTED_ACCOUNT_ID,
    stripeAccountId: process.env.COMPOSIO_STRIPE_CONNECTED_ACCOUNT_ID,
    zendeskAccountId: process.env.COMPOSIO_ZENDESK_CONNECTED_ACCOUNT_ID,
  };

  for (const [key, value] of Object.entries(config)) {
    if (!value) throw new Error(`Missing Composio configuration: ${key}`);
  }
  return config as ComposioConfig;
}

async function newComposio(config: ComposioConfig) {
  const { Composio } = await import("@composio/core");
  return new Composio({
    apiKey: config.apiKey,
    allowTracking: false,
    disableVersionCheck: true,
  });
}

async function createReadSession(): Promise<ToolSession> {
  const config = composioConfig();
  const composio = await newComposio(config);
  return composio.sessions.create(
    config.merchantUserId,
    {
      sessionPreset: "direct_tools",
      toolkits: ["shopify", "stripe", "zendesk"],
      tools: {
        shopify: { enable: [...COMPOSIO_READ_TOOLS.shopify] },
        stripe: { enable: [...COMPOSIO_READ_TOOLS.stripe] },
        zendesk: { enable: [...COMPOSIO_READ_TOOLS.zendesk] },
      },
      connectedAccounts: {
        shopify: [config.shopifyAccountId],
        stripe: [config.stripeAccountId],
        zendesk: [config.zendeskAccountId],
      },
      manageConnections: false,
      sandbox: { enable: false },
      preload: {
        tools: [
          ...COMPOSIO_READ_TOOLS.shopify,
          ...COMPOSIO_READ_TOOLS.stripe,
          ...COMPOSIO_READ_TOOLS.zendesk,
        ],
      },
    },
    {
      signal: AbortSignal.timeout(
        configuredTimeout("COMPOSIO_SESSION_TIMEOUT_MS", 5_000),
      ),
    },
  );
}

async function createWriteSession(): Promise<ToolSession> {
  const config = composioConfig();
  const composio = await newComposio(config);
  return composio.sessions.create(
    config.merchantUserId,
    {
      sessionPreset: "direct_tools",
      toolkits: ["stripe", "zendesk"],
      tools: {
        stripe: { enable: [...COMPOSIO_WRITE_TOOLS.stripe] },
        zendesk: { enable: [...COMPOSIO_WRITE_TOOLS.zendesk] },
      },
      connectedAccounts: {
        stripe: [config.stripeAccountId],
        zendesk: [config.zendeskAccountId],
      },
      manageConnections: false,
      sandbox: { enable: false },
      preload: {
        tools: [
          ...COMPOSIO_WRITE_TOOLS.stripe,
          ...COMPOSIO_WRITE_TOOLS.zendesk,
        ],
      },
    },
    {
      signal: AbortSignal.timeout(
        configuredTimeout("COMPOSIO_SESSION_TIMEOUT_MS", 5_000),
      ),
    },
  );
}

function readSession(): Promise<ToolSession> {
  readSessionPromise ??= createReadSession().catch((error) => {
    readSessionPromise = null;
    throw error;
  });
  return readSessionPromise;
}

function writeSession(): Promise<ToolSession> {
  writeSessionPromise ??= createWriteSession().catch((error) => {
    writeSessionPromise = null;
    throw error;
  });
  return writeSessionPromise;
}

async function executeRead(
  session: ToolSession,
  slug: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await session.execute(slug, args, undefined, {
    signal: AbortSignal.timeout(
      configuredTimeout("COMPOSIO_READ_TIMEOUT_MS", 5_000),
    ),
  });
  if (result.error) throw new Error(`${slug}: ${result.error}`);
  return result.data;
}

async function executeWrite(
  session: ToolSession,
  slug: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await session.execute(slug, args, undefined, {
    signal: AbortSignal.timeout(
      configuredTimeout("COMPOSIO_WRITE_TIMEOUT_MS", 8_000),
    ),
  });
  if (result.error) throw new Error(`${slug}: ${result.error}`);
  return result.data;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function field(object: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) return object[key];
  }
  return undefined;
}

function dateValue(value: unknown): string | undefined {
  if (typeof value === "number") {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(milliseconds).toISOString();
  }
  const text = stringValue(value);
  if (!text) return undefined;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function findArray(
  value: unknown,
  keys: string[],
  depth = 0,
): unknown[] {
  if (depth > 6) return [];
  if (Array.isArray(value)) return value;
  const object = record(value);
  if (!object) return [];

  for (const key of keys) {
    if (Array.isArray(object[key])) return object[key] as unknown[];
  }
  for (const child of Object.values(object)) {
    const found = findArray(child, keys, depth + 1);
    if (found.length) return found;
  }
  return [];
}

function findString(value: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 5) return undefined;
  const object = record(value);
  if (!object) return undefined;
  for (const key of keys) {
    const text = stringValue(object[key]);
    if (text) return text;
  }
  for (const child of Object.values(object)) {
    const found = findString(child, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function exactEmailMatch(items: unknown[], email: string): Record<string, unknown> | null {
  const normalized = email.toLocaleLowerCase("en-US");
  return (
    items
      .map(record)
      .find(
        (item) =>
          stringValue(item?.email)?.toLocaleLowerCase("en-US") === normalized,
      ) ?? null
  );
}

function mapOrder(value: unknown): Order | null {
  const order = record(value);
  if (!order) return null;
  const id = stringValue(field(order, "name", "id", "order_id"));
  const placedAt = dateValue(field(order, "created_at", "processed_at", "placedAt"));
  if (!id || !placedAt) return null;

  const fulfillments = findArray(order.fulfillments, ["fulfillments"])
    .map(record)
    .filter(Boolean) as Record<string, unknown>[];
  const deliveredFulfillment = fulfillments.find((fulfillment) =>
    ["delivered"].includes(
      stringValue(field(fulfillment, "shipment_status", "status"))?.toLowerCase() ?? "",
    ),
  );
  const activeFulfillment = fulfillments[0];
  const deliveredAt = dateValue(
    field(order, "delivered_at", "deliveredAt") ??
      field(deliveredFulfillment ?? {}, "updated_at", "delivered_at"),
  );
  const fulfillmentStatus =
    stringValue(field(order, "fulfillment_status", "status"))?.toLowerCase() ?? "";
  const status: Order["status"] = deliveredAt || fulfillmentStatus === "fulfilled"
    ? "delivered"
    : fulfillments.length || ["in_transit", "out_for_delivery"].includes(fulfillmentStatus)
      ? "in_transit"
      : "processing";
  const lineItems = findArray(field(order, "line_items", "items"), ["line_items", "items"]);
  const items = lineItems
    .map((item) => {
      const itemRecord = record(item);
      if (!itemRecord) return null;
      return {
        sku: stringValue(field(itemRecord, "sku", "variant_id")) ?? "unknown",
        name: stringValue(field(itemRecord, "name", "title")) ?? "Item",
        qty: numberValue(field(itemRecord, "quantity", "qty")) ?? 1,
      };
    })
    .filter(Boolean) as Order["items"];

  return {
    id: id.replace(/^#/, ""),
    placedAt,
    status,
    promisedBy: dateValue(
      field(order, "promised_by", "promisedBy", "estimated_delivery_at", "delivery_date"),
    ),
    deliveredAt,
    lastTrackingAt: dateValue(
      field(order, "last_tracking_at", "lastTrackingAt") ??
        field(activeFulfillment ?? {}, "updated_at"),
    ),
    items: items.length ? items : [{ sku: "unknown", name: "Item", qty: 1 }],
    total: Math.round(
      (numberValue(field(order, "total_cents", "total")) ??
        (numberValue(field(order, "total_price")) ?? 0) * 100),
    ),
  };
}

function mapCharge(value: unknown): Charge | null {
  const charge = record(value);
  if (!charge) return null;
  const id = stringValue(field(charge, "id", "charge_id"));
  const amount = numberValue(field(charge, "amount", "amount_cents"));
  const createdAt = dateValue(field(charge, "created", "created_at", "createdAt"));
  if (!id || amount === undefined || !createdAt) return null;
  const metadata = record(charge.metadata) ?? {};
  const rawStatus = stringValue(field(charge, "status"))?.toLowerCase();
  return {
    id,
    amount,
    createdAt,
    status:
      rawStatus === "failed"
        ? "failed"
        : rawStatus === "pending"
          ? "pending"
          : "succeeded",
    orderId:
      stringValue(field(metadata, "order_id", "orderId")) ??
      stringValue(field(charge, "order_id", "invoice")) ??
      "unlinked",
  };
}

function mapSubscription(value: unknown): Subscription | null {
  const subscription = record(value);
  if (!subscription) return null;
  const id = stringValue(field(subscription, "id", "subscription_id"));
  const renewedAt = dateValue(
    field(subscription, "current_period_start", "renewed_at", "renewedAt", "created"),
  );
  if (!id || !renewedAt) return null;
  const item = findArray(subscription.items, ["data", "items"])
    .map(record)
    .find(Boolean);
  const price = record(item?.price) ?? {};
  const rawStatus = stringValue(subscription.status)?.toLowerCase();
  return {
    id,
    planName:
      stringValue(field(subscription, "name", "description")) ??
      stringValue(field(price, "nickname", "product")) ??
      "Subscription",
    amount:
      numberValue(field(subscription, "amount")) ??
      numberValue(field(price, "unit_amount")) ??
      0,
    renewedAt,
    status:
      rawStatus === "canceled" || rawStatus === "cancelled"
        ? "cancelled"
        : rawStatus === "paused"
          ? "paused"
          : "active",
  };
}

function mapRefund(value: unknown): Refund | null {
  const refund = record(value);
  if (!refund) return null;
  const id = stringValue(field(refund, "id", "refund_id"));
  const amount = numberValue(field(refund, "amount", "amount_cents"));
  const initiatedAt = dateValue(field(refund, "created", "created_at", "initiatedAt"));
  if (!id || amount === undefined || !initiatedAt) return null;
  const rawStatus = stringValue(refund.status)?.toLowerCase();
  return {
    id,
    amount,
    initiatedAt,
    status:
      rawStatus === "succeeded" || rawStatus === "settled"
        ? "settled"
        : rawStatus === "failed" || rawStatus === "canceled"
          ? "failed"
          : "pending",
    chargeId: stringValue(field(refund, "charge", "charge_id")),
  };
}

function mapTicket(value: unknown): PriorTicket | null {
  const ticket = record(value);
  if (!ticket) return null;
  const id = numberValue(field(ticket, "id", "ticket_id"));
  const subject = stringValue(field(ticket, "subject", "title"));
  const createdAt = dateValue(field(ticket, "updated_at", "created_at", "createdAt"));
  if (id === undefined || !subject || !createdAt) return null;
  const rawStatus = stringValue(ticket.status)?.toLowerCase();
  const status: PriorTicket["status"] = ["open", "pending", "solved", "closed"].includes(
    rawStatus ?? "",
  )
    ? (rawStatus as PriorTicket["status"])
    : "open";
  return { id, subject, createdAt, status };
}

async function readShopify(
  session: ToolSession,
  email: string,
): Promise<{ name?: string; orders: Order[] }> {
  const customersPayload = await executeRead(session, "SHOPIFY_GET_CUSTOMERS_SEARCH", {
    query: `email:${email}`,
    limit: 1,
  });
  const customer = exactEmailMatch(findArray(customersPayload, ["customers", "data"]), email);
  if (!customer) return { orders: [] };
  const customerId = stringValue(field(customer, "id", "customer_id"));
  if (!customerId) throw new Error("Shopify customer id was missing.");
  const ordersPayload = await executeRead(session, "SHOPIFY_GET_CUSTOMER_ORDERS", {
    customer_id: customerId,
    status: "any",
    limit: 50,
  });
  return {
    name:
      stringValue(field(customer, "name")) ??
      ([stringValue(customer.first_name), stringValue(customer.last_name)]
        .filter(Boolean)
        .join(" ") || undefined),
    orders: findArray(ordersPayload, ["orders", "data"])
      .map(mapOrder)
      .filter(Boolean) as Order[],
  };
}

async function readStripe(
  session: ToolSession,
  email: string,
): Promise<{ charges: Charge[]; subscriptions: Subscription[]; refunds: Refund[] }> {
  const customerPayload = await executeRead(session, "STRIPE_LIST_CUSTOMERS", {
    email,
    limit: 1,
  });
  const customer = exactEmailMatch(findArray(customerPayload, ["customers", "data"]), email);
  if (!customer) return { charges: [], subscriptions: [], refunds: [] };
  const customerId = stringValue(field(customer, "id", "customer_id"));
  if (!customerId) throw new Error("Stripe customer id was missing.");

  const [chargesPayload, subscriptionsPayload, refundsPayload] = await Promise.all([
    executeRead(session, "STRIPE_LIST_CHARGES", { customer: customerId, limit: 100 }),
    executeRead(session, "STRIPE_LIST_SUBSCRIPTIONS", {
      customer: customerId,
      status: "all",
      limit: 100,
    }),
    executeRead(session, "STRIPE_LIST_REFUNDS", { limit: 100 }),
  ]);
  const charges = findArray(chargesPayload, ["charges", "data"])
    .map(mapCharge)
    .filter(Boolean) as Charge[];
  const chargeIds = new Set(charges.map((charge) => charge.id));
  return {
    charges,
    subscriptions: findArray(subscriptionsPayload, ["subscriptions", "data"])
      .map(mapSubscription)
      .filter(Boolean) as Subscription[],
    refunds: findArray(refundsPayload, ["refunds", "data"])
      .map(mapRefund)
      .filter((refund): refund is Refund => Boolean(refund?.chargeId && chargeIds.has(refund.chargeId))),
  };
}

async function readZendesk(
  session: ToolSession,
  email: string,
): Promise<PriorTicket[]> {
  const usersPayload = await executeRead(session, "ZENDESK_SEARCH_ZENDESK_USERS", {
    query: email,
    per_page: 10,
  });
  const user = exactEmailMatch(findArray(usersPayload, ["users", "data"]), email);
  if (!user) return [];
  const userId = numberValue(field(user, "id", "user_id"));
  if (userId === undefined) throw new Error("Zendesk requester id was missing.");
  const ticketsPayload = await executeRead(
    session,
    "ZENDESK_GET_USERS_REQUESTED_TICKETS",
    {
      user_id: userId,
      sort_by: "created_at",
      sort_order: "desc",
      per_page: 20,
    },
  );
  return findArray(ticketsPayload, ["tickets", "data"])
    .map(mapTicket)
    .filter(Boolean) as PriorTicket[];
}

export async function getAccountState(
  email: string,
  demoMode: boolean,
): Promise<{ state: AccountState; source: ProviderSource }> {
  const fixture = getFixtureAccount(email);
  if (demoMode) return { state: fixture, source: "fixture" };

  try {
    const session = await readSession();
    const [shopify, stripe, zendesk] = await Promise.allSettled([
      readShopify(session, email),
      readStripe(session, email),
      readZendesk(session, email),
    ]);

    if (
      shopify.status !== "fulfilled" ||
      stripe.status !== "fulfilled" ||
      zendesk.status !== "fulfilled"
    ) {
      console.info("[Wordless] Composio read fallback", {
        shopify: shopify.status,
        stripe: stripe.status,
        zendesk: zendesk.status,
      });
      return { state: fixture, source: "fallback" };
    }

    const shopifyValue = shopify.value;
    const stripeValue = stripe.value;
    const zendeskValue = zendesk.value;

    return {
      source: "live",
      state: {
        email,
        name: shopifyValue.name || fixture.name,
        orders: shopifyValue.orders,
        charges: stripeValue.charges,
        subscriptions: stripeValue.subscriptions,
        refunds: stripeValue.refunds,
        priorTickets: zendeskValue,
      },
    };
  } catch (error) {
    console.info("[Wordless] Composio account fallback", error);
    return { state: fixture, source: "fallback" };
  }
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function notCompletedReceipt(uncertain = false): ActionReceipt {
  return {
    status: "not_completed",
    title: uncertain ? "Check before trying again." : "Nothing changed.",
    detail: uncertain
      ? "The connection stopped before it confirmed the result."
      : "The account connection did not confirm the action.",
    reference: uncertain
      ? "No second action will run automatically."
      : "You can start again when you are ready.",
    source: "fallback",
  };
}

async function createZendeskTicket(
  session: ToolSession,
  email: string,
  action: ActionSpec,
  wordlessActionId: string,
): Promise<string> {
  const customerWords =
    action.kind === "escalate_support" && action.fragment.trim()
      ? ` Customer words: “${action.fragment}”.`
      : "";
  const result = await executeWrite(session, "ZENDESK_CREATE_ZENDESK_TICKET", {
    subject: `Wordless support action: ${action.kind.replaceAll("_", " ")}`,
    description: `The customer selected “${action.label}” in Wordless.${customerWords} Action id: ${wordlessActionId}.`,
    requester_name: email.split("@")[0],
    requester_email: email,
  });
  return findString(result, ["ticket_id", "id"]) ?? "created";
}

export async function executeAction(
  action: ActionSpec,
  email: string,
  wordlessActionId: string,
  demoMode: boolean,
): Promise<ActionReceipt> {
  if (demoMode) return fixtureReceipt(action);
  const previous = actionLedger.get(wordlessActionId);
  if (previous) return previous;

  try {
    const session = await writeSession();
    let receipt: ActionReceipt;

    if (action.kind === "refund_duplicate") {
      let refundResult: Record<string, unknown>;
      try {
        refundResult = await executeWrite(session, "STRIPE_CREATE_REFUND", {
          charge: action.chargeId,
          amount: action.amount,
          reason: "duplicate",
          metadata: {
            wordless_action_id: wordlessActionId,
            order_id: action.orderId,
          },
        });
      } catch (error) {
        console.info("[Wordless] Composio refund outcome unknown", error);
        receipt = notCompletedReceipt(true);
        actionLedger.set(wordlessActionId, receipt);
        return receipt;
      }

      const refundId = findString(refundResult, ["refund_id", "id"]) ?? "confirmed";
      let ticketReference = "Zendesk ticket not changed";
      try {
        const ticketId = await createZendeskTicket(session, email, action, wordlessActionId);
        ticketReference = `Zendesk ticket #${ticketId}`;
      } catch (error) {
        console.info("[Wordless] Composio ticket follow-up did not complete", error);
      }
      receipt = {
        status: "completed",
        title: `Done. Refund of ${money(action.amount)} sent.`,
        detail: "The duplicate charge is being returned to the original card.",
        reference: `Stripe refund ${refundId} · ${ticketReference}`,
        source: "live",
      };
    } else if (action.kind === "continue_ticket") {
      await executeWrite(session, "ZENDESK_UPDATE_ZENDESK_TICKET", {
        ticket_id: action.ticketId,
        status: "open",
        comment_body: `Customer reopened this ticket through Wordless. Action id: ${wordlessActionId}.`,
        comment_public: false,
      });
      receipt = {
        status: "completed",
        title: "Done. Your ticket is open.",
        detail: "A support specialist can continue from the earlier message.",
        reference: `Zendesk ticket #${action.ticketId} reopened`,
        source: "live",
      };
    } else {
      const ticketId = await createZendeskTicket(session, email, action, wordlessActionId);
      const fallback = fixtureReceipt(action);
      receipt = {
        ...fallback,
        reference: `Zendesk ticket #${ticketId}`,
        source: "live",
      };
    }

    actionLedger.set(wordlessActionId, receipt);
    return receipt;
  } catch (error) {
    console.info("[Wordless] Composio action did not complete", error);
    const receipt = notCompletedReceipt(false);
    actionLedger.set(wordlessActionId, receipt);
    return receipt;
  }
}
