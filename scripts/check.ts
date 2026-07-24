// The falsifiable claim, executable: a healthy account produces ZERO
// hypotheses; ticket-generating accounts produce two or three; the golden
// paths rank exactly as designed. Run with `npm run check`. Non-zero exit
// on any failure — if the clean account yields hypotheses, the rules are
// too loose and the thesis collapses.

import { clean, maria, sam, jo } from "../lib/fixtures";
import { generateHypotheses as handWritten } from "../lib/hypotheses";
import { generateHypotheses as generated, GENERATED } from "../lib/hypotheses.generated";
import { rank, keywordSimilarity } from "../lib/rank";
import { countWords } from "../lib/format";
import type { AccountState } from "../lib/types";

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

const engines: [string, (s: AccountState) => ReturnType<typeof handWritten>][] = [
  ["hand-written", handWritten],
  [GENERATED ? "generated (Codex)" : "generated (placeholder → hand-written)", generated],
];

async function main() {
  for (const [name, engine] of engines) {
    console.log(`\nEngine: ${name}`);
    assert(engine(clean).length === 0, "clean account → 0 hypotheses (the thesis)");
    assert(engine(maria).length === 3, `maria → exactly 3 (got ${engine(maria).length})`);
    assert(engine(sam).length === 2, `sam → exactly 2 (got ${engine(sam).length})`);
    assert(engine(jo).length === 1, `jo → exactly 1 (got ${engine(jo).length})`);

    const kinds = (s: AccountState) => engine(s).map((h) => h.kind).sort().join(",");
    assert(
      kinds(maria) === "duplicate_charge,late_delivery,wrong_item",
      "maria kinds: duplicate_charge + late_delivery + wrong_item"
    );
    assert(
      kinds(sam) === "refund_pending,unexpected_renewal",
      "sam kinds: refund_pending + unexpected_renewal"
    );
    assert(kinds(jo) === "late_delivery", "jo kinds: late_delivery");
  }

  // Engine parity — the generated engine must be a drop-in for the rules.
  console.log("\nEngine parity");
  for (const fixture of [clean, maria, sam, jo]) {
    const a = handWritten(fixture).map((h) => `${h.kind}:${h.title}:${h.detail}`).sort();
    const b = generated(fixture).map((h) => `${h.kind}:${h.title}:${h.detail}`).sort();
    assert(
      JSON.stringify(a) === JSON.stringify(b),
      `${fixture.email}: generated engine matches hand-written output`
    );
  }

  // Path A — golden. DEMO-CRITICAL order: charged twice → wrong item → late.
  console.log("\nPath A — 'order wrong the thing help' (maria)");
  const a = await rank(handWritten(maria), "order wrong the thing help", true);
  assert(a.candidates.length === 3, "three cards");
  assert(a.matchedBy === "precomputed", `matched via precomputed table (got ${a.matchedBy})`);
  assert(
    a.candidates.map((c) => c.kind).join(" → ") ===
      "duplicate_charge → wrong_item → late_delivery",
    `order: duplicate_charge → wrong_item → late_delivery (got ${a.candidates
      .map((c) => c.kind)
      .join(" → ")})`
  );
  assert(a.candidates[0].title === "You were charged twice", "card 1 title");
  assert(countWords("order wrong the thing help") === 4, "words meter reads 4");

  // Path B — circumlocution. "the boily thing broke" must find the kettle.
  console.log("\nPath B — 'the boily thing broke' (maria)");
  const b = await rank(handWritten(maria), "the boily thing broke", true);
  assert(b.matchedBy === "precomputed", "offline precompute covers Path B");
  assert(
    b.candidates[0].kind === "wrong_item",
    `wrong_item first (got ${b.candidates[0]?.kind})`
  );
  assert(countWords("the boily thing broke") === 3, "words meter reads 3");

  // Path B resilience — keyword rung alone must ALSO find the kettle, so the
  // claim survives even off the golden fragment ("boily" is in variants).
  const kettleHyp = handWritten(maria).find((h) => h.kind === "wrong_item")!;
  assert(
    keywordSimilarity("boily thing cracked", kettleHyp) > 0,
    "keyword rung still catches circumlocution variants"
  );

  // Path C — zero words. Ranked on account state and recency alone.
  console.log("\nPath C — empty fragment (maria)");
  const c = await rank(handWritten(maria), "", true);
  assert(c.candidates.length === 3, "three cards from zero words");
  assert(c.matchedBy === "none", "no semantic source used");
  assert(countWords("") === 0, "words meter reads 0");

  // Judge input — arbitrary garbage must return cards and never throw.
  console.log("\nJudge input");
  for (const garbage of [
    "asdf qwer zxcv",
    "MONEY MONEY MONEY!!!",
    "no",
    "🫖",
    "where is the thing i paid for it twice maybe??",
    "x".repeat(2000),
  ]) {
    const r = await rank(handWritten(maria), garbage, true);
    assert(
      r.candidates.length === 3,
      `\"${garbage.slice(0, 30)}${garbage.length > 30 ? "…" : ""}\" → 3 cards, no crash`
    );
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("check crashed:", err);
  process.exit(1);
});
