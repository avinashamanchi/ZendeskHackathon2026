// Every stage-visible rhythm lives here — ONE place to retune after a
// read-aloud pass (§18 step 15).
//
// §9.6 is followed verbatim for the stream (32ms/char, 380ms line pause,
// 550ms head pause). With the full Path A script that runs longer than the
// table's "~13 seconds" estimate — the two specs conflict — and §9.6's own
// tie-breaker is "slow enough to read aloud", so the rates win. Cards land
// on the §12.10 master timing regardless; the stream keeps thinking under
// them, which reads as a mind finishing its sentence.

export const REASON = {
  CHAR_MS: 32,
  LINE_PAUSE_MS: 380,
  HEAD_PAUSE_MS: 550,
  HEAD_FADE_MS: 200,
  CURSOR_BLINK_MS: 530,
} as const;

export const LEGACY_CHAR_MS = 22; // §12.10: legacy panel types at ~22ms/char

export const CARDS = {
  RISE_MS: 240, // §12.10: cards fade and rise over 240ms
  STAGGER_MS: 700, // card 2 at +0.7s, card 3 at +1.4s
  METERS_AFTER_MS: 2000, // meters count up ~2s after card 1
} as const;

/** presenter-mode: spacing between events replayed inside one gate */
export const PRESENT_STEP_MS = 120;
