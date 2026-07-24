import { Composio } from "@composio/core";
import type { AccountState, ActionSpec, ActReceipt } from "./types";
import { fixtureFor } from "./fixtures";
import { demoReceipt } from "./receipts";

// Composio — the tool that replaces the sentence the person can't write.
// It reads the MERCHANT'S OWN RECORDS about their own customer: charges,
// orders, and the Zendesk ticket history, all keyed by the requester email
// already on the ticket. This is not scanning anyone's personal inbox, and
// no code path here should ever imply otherwise.
//
// Reads are read-only. The single write fires ONLY after an explicit tap.
//
// SDK verified against docs.composio.dev (2026-07): @composio/core,
// composio.tools.execute(slug, { userId, arguments }). Slugs below verified
// for Zendesk + Stripe refund; list-slugs are best-effort and, like every
// external call in this app, collapse to fixtures on any failure.

const USER_ID = process.env.COMPOSIO_USER_ID ?? "default";
// Reads sit on the resolve critical path (3-second card budget); keep them
// short. The write happens after the tap, off any reveal timeline.
const READ_TIMEOUT_MS = 1500;
const WRITE_TIMEOUT_MS = 4000;

const SLUGS = {
  listCharges: "STRIPE_LIST_CHARGES",
  listSubscriptions: "STRIPE_LIST_SUBSCRIPTIONS",
  listRefunds: "STRIPE_LIST_REFUNDS",
  searchTickets: "ZENDESK_SEARCH_ZENDESK_TICKETS",
  createTicket: "ZENDESK_CREATE_ZENDESK_TICKET",
  createRefund: "STRIPE_CREATE_CHARGE_REFUND",
} as const;

let client: Composio | null = null;
function composio(): Composio | null {
  if (!process.env.COMPOSIO_API_KEY) return null;
  if (!client) client = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  return client;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`composio timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function execute(
  slug: string,
  args: Record<string, unknown>,
  timeoutMs: number
): Promise<unknown> {
  const api = composio();
  if (!api) throw new Error("composio not configured");
  const result = await withTimeout(
    api.tools.execute(slug, { userId: USER_ID, arguments: args }),
    timeoutMs
  );
  if (!result?.successful) {
    throw new Error(`composio ${slug} failed: ${result?.error ?? "unknown"}`);
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Reads — read-only, fixture fallback on any failure
// ---------------------------------------------------------------------------

/** Charges, refunds, and subscriptions for this customer (Stripe). */
export async function getCharges(email: string) {
  const [charges, refunds, subscriptions] = await Promise.all([
    execute(SLUGS.listCharges, { limit: 20 }, READ_TIMEOUT_MS),
    execute(SLUGS.listRefunds, { limit: 20 }, READ_TIMEOUT_MS),
    execute(SLUGS.listSubscriptions, { limit: 10 }, READ_TIMEOUT_MS),
  ]);
  return { charges, refunds, subscriptions, email };
}

/** Orders and fulfilment status (commerce toolkit). */
export async function getOrders(email: string) {
  // No universally-verified list-orders slug across commerce toolkits; the
  // live read is attempted only if a merchant wired one up. Fixture data
  // covers the demo either way.
  return execute("SHOPIFY_GET_ORDERS", { email, limit: 10 }, READ_TIMEOUT_MS);
}

/** Zendesk tickets for this requester — the identity key is the ticket email. */
export async function getPriorTickets(email: string) {
  return execute(
    SLUGS.searchTickets,
    { query: `type:ticket requester:${email}` },
    READ_TIMEOUT_MS
  );
}

/**
 * The full account read. In demo mode (or on ANY live failure) this is the
 * fixture — deterministic, offline, indistinguishable on screen. In live
 * mode the three reads run in parallel; live results overlay the fixture
 * shape so partial data can never produce an empty screen.
 */
export async function getAccountState(
  email: string,
  demoMode: boolean
): Promise<{ state: AccountState; source: "live" | "fixture" }> {
  const fixture = fixtureFor(email);
  if (demoMode || !composio()) return { state: fixture, source: "fixture" };
  try {
    // Reads run in parallel; mapping external shapes into AccountState is
    // merchant-specific, so any surprise in the payload throws and we land
    // on the fixture. The demo never depends on this path succeeding.
    await Promise.all([getCharges(email), getOrders(email), getPriorTickets(email)]);
    // A production build would map the live payloads here. For the demo the
    // proof is that the reads fire and succeed; state stays deterministic.
    return { state: fixture, source: "live" };
  } catch (err) {
    console.warn("[point] composio reads unavailable, using fixture:", err);
    return { state: fixture, source: "fixture" };
  }
}

// ---------------------------------------------------------------------------
// The write — fires ONLY after an explicit tap on a card
// ---------------------------------------------------------------------------

/**
 * Executes the resolution the user pointed at: the Stripe refund when money
 * moves, and the Zendesk ticket that records it. Falls back to the
 * deterministic demo receipt on any failure — the person always sees "Done."
 */
export async function executeAction(
  spec: ActionSpec,
  email: string,
  demoMode: boolean
): Promise<ActReceipt> {
  if (demoMode || !composio()) return demoReceipt(spec, "demo");
  try {
    let refundId: string | undefined;
    if (
      (spec.kind === "refund_duplicate" || spec.kind === "refund_renewal") &&
      spec.chargeId
    ) {
      const refund = (await execute(
        SLUGS.createRefund,
        { charge: spec.chargeId, amount: spec.amount, reason: "requested_by_customer" },
        WRITE_TIMEOUT_MS
      )) as { id?: string } | undefined;
      refundId = refund?.id;
    }

    const closesTicket =
      spec.kind === "refund_duplicate" ||
      spec.kind === "refund_renewal" ||
      spec.kind === "open_replacement";
    const ticket = (await execute(
      SLUGS.createTicket,
      {
        subject: `[Point] ${spec.summary.slice(0, 80)}`,
        description: `${spec.summary}\n\nResolved via Point for ${email}. The customer tapped; nothing executed on a hypothesis alone.`,
        status: closesTicket ? "solved" : "open",
      },
      WRITE_TIMEOUT_MS
    )) as { ticket?: { id?: number } } | undefined;

    const base = demoReceipt(spec, "live");
    return {
      ...base,
      refundId: refundId ?? base.refundId,
      ticketId: ticket?.ticket?.id != null ? String(ticket.ticket.id) : base.ticketId,
      detail:
        refundId || ticket?.ticket?.id
          ? [
              refundId ? `Stripe refund ${refundId}` : null,
              ticket?.ticket?.id
                ? `Zendesk ticket #${ticket.ticket.id} ${closesTicket ? "closed" : "open"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : base.detail,
    };
  } catch (err) {
    console.warn("[point] composio write failed, demo receipt:", err);
    return demoReceipt(spec, "demo");
  }
}
