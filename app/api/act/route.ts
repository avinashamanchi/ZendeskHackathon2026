import { NextResponse } from "next/server";
import type { ActionSpec } from "@/lib/types";
import { executeAction, getAccountState } from "@/lib/composio";
import { hypothesesFor } from "@/lib/engine";
import { demoReceipt } from "@/lib/receipts";

// POST { action, email, demo } → receipt.
// The ONLY write in the system, and it fires only because a person tapped a
// card. Nothing ever executes on a hypothesis alone. Can not 500.
//
// Live mode goes further: the client's action is only a REFERENCE. The server
// re-derives the hypotheses from account state and executes its own matching
// ActionSpec — a crafted body can never move money or write ticket content
// the account state doesn't justify.

export const runtime = "nodejs";

const ENV_DEMO_DEFAULT = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

const ACTION_KINDS = new Set([
  "refund_duplicate",
  "open_replacement",
  "trace_shipment",
  "refund_renewal",
  "expedite_refund",
  "file_ticket",
]);

function sanitizeAction(raw: unknown): ActionSpec | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== "string" || !ACTION_KINDS.has(r.kind)) return null;
  if (typeof r.summary !== "string") return null;
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 100) : undefined);
  const cents = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10_000_000
      ? Math.floor(v)
      : undefined;
  return {
    kind: r.kind as ActionSpec["kind"],
    summary: r.summary.slice(0, 300),
    amount: cents(r.amount),
    orderId: str(r.orderId),
    chargeId: str(r.chargeId),
    subscriptionId: str(r.subscriptionId),
    refundId: str(r.refundId),
  };
}

export async function POST(request: Request) {
  let action: ActionSpec | null = null;
  let email = "maria@example.com";
  let demoMode = ENV_DEMO_DEFAULT;
  try {
    const body = await request.json();
    action = sanitizeAction(body.action);
    if (typeof body.email === "string") email = body.email.slice(0, 200);
    if (typeof body.demo === "boolean") demoMode = body.demo;
  } catch {
    // malformed body handled below
  }

  if (!action) {
    // Even a garbage request gets a coherent, harmless receipt — the screen
    // never shows an error. No write happens for an unrecognized action.
    return NextResponse.json(
      demoReceipt(
        { kind: "trace_shipment", summary: "Unrecognized action; filed for a human." },
        "demo"
      )
    );
  }

  try {
    let toExecute = action;
    // file_ticket only opens a ticket carrying the customer's own words —
    // it is the zero-hypothesis handoff and is always permitted.
    if (!demoMode && action.kind !== "file_ticket") {
      // Allowlist: find the server-derived action this request points at and
      // execute THAT (server-authored summary included), or don't write at all.
      const { state } = await getAccountState(email, false);
      const match = hypothesesFor(state)
        .map((h) => h.action)
        .find(
          (a) =>
            a.kind === action!.kind &&
            a.chargeId === action!.chargeId &&
            a.orderId === action!.orderId &&
            a.subscriptionId === action!.subscriptionId &&
            a.refundId === action!.refundId &&
            a.amount === action!.amount
        );
      if (!match) {
        console.warn("[point] act request matched no derived hypothesis; no write");
        return NextResponse.json(demoReceipt(action, "demo"));
      }
      toExecute = match;
    }
    const receipt = await executeAction(toExecute, email, demoMode);
    return NextResponse.json(receipt);
  } catch (err) {
    console.warn("[point] act fell back to demo receipt:", err);
    return NextResponse.json(demoReceipt(action, "demo"));
  }
}
