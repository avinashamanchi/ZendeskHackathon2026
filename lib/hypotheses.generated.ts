// PLACEHOLDER — scripts/generate-rules.ts overwrites this file.
// Until the generator has run, the generated engine IS the hand-written one,
// so nothing anywhere can break on its absence.
import type { AccountState, Hypothesis } from "./types";
import { generateHypotheses as handWritten } from "./hypotheses";

export const GENERATED = false;

export function generateHypotheses(state: AccountState): Hypothesis[] {
  return handWritten(state);
}
