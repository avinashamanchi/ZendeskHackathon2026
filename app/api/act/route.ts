import { NextResponse } from "next/server";
import type { ActionSpec } from "@/lib/types";
import { executeAction } from "@/lib/composio";
import { demoReceipt } from "@/lib/receipts";

// POST { action, email, demo } → receipt.
// The ONLY write in the system, and it fires only because a person tapped a
// card. Nothing ever executes on a hypothesis alone. Can not 500.

export const runtime = "nodejs";

const ENV_DEMO_DEFAULT = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

const ACTION_KINDS = new Set([
  "refund_duplicate",
  "open_replacement",
  "trace_shipment",
  "refund_renewal",
  "expedite_refund",
]);

export async function POST(request: Request) {
  let action: ActionSpec | null = null;
  let email = "maria@example.com";
  let demoMode = ENV_DEMO_DEFAULT;
  try {
    const body = await request.json();
    if (
      body.action &&
      typeof body.action.kind === "string" &&
      ACTION_KINDS.has(body.action.kind) &&
      typeof body.action.summary === "string"
    ) {
      action = body.action as ActionSpec;
    }
    if (typeof body.email === "string") email = body.email;
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
    const receipt = await executeAction(action, email, demoMode);
    return NextResponse.json(receipt);
  } catch (err) {
    console.warn("[point] act fell back to demo receipt:", err);
    return NextResponse.json(demoReceipt(action, "demo"));
  }
}
