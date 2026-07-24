import type { AccountState, Hypothesis } from "./types";
import { generateHypotheses as handWritten } from "./hypotheses";
import { generateHypotheses as generated } from "./hypotheses.generated";

// The app runs the Codex-generated engine (lib/hypotheses.generated.ts,
// emitted offline from ticket history) and falls back to the hand-written
// five rules if the generated engine ever misbehaves. scripts/check.ts
// asserts the two engines agree on every fixture, so the fallback is a
// seatbelt, not a divergence.
export function hypothesesFor(state: AccountState): Hypothesis[] {
  try {
    const out = generated(state);
    if (Array.isArray(out)) return out;
  } catch (err) {
    console.warn("[point] generated engine failed, using hand-written rules:", err);
  }
  return handWritten(state);
}
