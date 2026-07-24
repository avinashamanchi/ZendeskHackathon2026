import assert from "node:assert/strict";
import test from "node:test";

import {
  getCleanFixture,
  getFixtureAccount,
  LEGACY_GOLDEN_RESPONSE,
} from "../lib/fixtures";
import { generateHypotheses } from "../lib/hypotheses.generated";
import { legacyResponse } from "../lib/llm";
import { rankHypotheses } from "../lib/rank";
import { countWords } from "../lib/text";
import { signActionToken, verifyActionToken } from "../lib/action-token";

const FIXED_NOW = new Date("2026-01-15T12:00:00.000Z");

function kindsFor(email: string): string[] {
  return generateHypotheses(getFixtureAccount(email, FIXED_NOW), FIXED_NOW).map(
    ({ kind }) => kind,
  );
}

function rankMaria(fragment: string) {
  const hypotheses = generateHypotheses(
    getFixtureAccount("maria@example.com", FIXED_NOW),
    FIXED_NOW,
  );
  return rankHypotheses(hypotheses, fragment, null, FIXED_NOW);
}

test("fixture timestamps resolve relative to an injected clock", () => {
  const maria = getFixtureAccount("maria@example.com", FIXED_NOW);
  const kettle = maria.orders.find(({ id }) => id === "A-4471");
  const olderOrder = maria.orders.find(({ id }) => id === "A-4390");
  const firstCharge = maria.charges.find(({ id }) => id === "ch_9001");
  const duplicate = maria.charges.find(({ id }) => id === "ch_9002");
  const priorTicket = maria.priorTickets.find(({ id }) => id === 3312);

  assert.ok(kettle);
  assert.ok(olderOrder);
  assert.ok(firstCharge);
  assert.ok(duplicate);
  assert.ok(priorTicket);
  assert.equal(kettle.placedAt, "2026-01-09T12:00:00.000Z");
  assert.equal(kettle.deliveredAt, "2026-01-13T12:00:00.000Z");
  assert.equal(olderOrder.deliveredAt, "2025-12-19T12:00:00.000Z");
  assert.equal(firstCharge.createdAt, "2026-01-09T12:00:00.000Z");
  assert.equal(duplicate.createdAt, "2026-01-09T12:00:40.000Z");
  assert.equal(
    Date.parse(duplicate.createdAt) - Date.parse(firstCharge.createdAt),
    40_000,
    "the locked duplicate-charge evidence is exactly 40 seconds apart",
  );
  assert.equal(priorTicket.createdAt, "2025-12-26T12:00:00.000Z");

  const laterClock = new Date("2026-02-20T08:30:00.000Z");
  const laterMaria = getFixtureAccount("maria@example.com", laterClock);
  assert.equal(
    laterMaria.orders.find(({ id }) => id === "A-4471")?.deliveredAt,
    "2026-02-18T08:30:00.000Z",
  );
  assert.notEqual(laterMaria.orders[0].placedAt, maria.orders[0].placedAt);
});

test("each ticket-generating fixture produces its exact account hypotheses", () => {
  assert.deepEqual(kindsFor("maria@example.com"), [
    "duplicate_charge",
    "wrong_item",
    "prior_ticket_followup",
  ]);
  assert.deepEqual(kindsFor("sam@example.com"), [
    "unexpected_renewal",
    "refund_pending",
    "prior_ticket_followup",
  ]);
  assert.deepEqual(kindsFor("jo@example.com"), [
    "late_delivery",
    "tracking_stalled",
    "prior_ticket_followup",
  ]);

  const maria = generateHypotheses(
    getFixtureAccount("maria@example.com", FIXED_NOW),
    FIXED_NOW,
  );
  assert.equal(maria.length, 3);
  assert.deepEqual(
    maria.map(({ id }) => id),
    [
      "duplicate-charge-ch_9002",
      "wrong-item-A-4471",
      "ticket-followup-3312",
    ],
  );

  assert.ok(
    maria.every(({ kind }) => kind !== "late_delivery"),
    "Maria has no overdue order, so the late-delivery rule must not fire",
  );

  const duplicate = maria[0];
  assert.equal(duplicate.title, "You were charged twice");
  assert.equal(
    duplicate.detail,
    "Two charges of $84.00 on January 9 for order A-4471.",
  );
  assert.deepEqual(duplicate.action, {
    kind: "refund_duplicate",
    label: "Refund $84.00",
    chargeId: "ch_9002",
    orderId: "A-4471",
    amount: 8400,
  });
});

test("the exact 40-second fixture is a duplicate and the rule retains its 60-minute boundary", () => {
  const atBoundary = getFixtureAccount("maria@example.com", FIXED_NOW);
  const firstChargeTime = Date.parse(
    atBoundary.charges.find(({ id }) => id === "ch_9001")!.createdAt,
  );
  atBoundary.charges.find(({ id }) => id === "ch_9002")!.createdAt = new Date(
    firstChargeTime + 60 * 60_000,
  ).toISOString();
  assert.ok(
    generateHypotheses(atBoundary, FIXED_NOW).some(
      ({ kind }) => kind === "duplicate_charge",
    ),
  );

  const outsideBoundary = getFixtureAccount("maria@example.com", FIXED_NOW);
  outsideBoundary.charges.find(({ id }) => id === "ch_9002")!.createdAt =
    new Date(firstChargeTime + 61 * 60_000).toISOString();
  assert.ok(
    generateHypotheses(outsideBoundary, FIXED_NOW).every(
      ({ kind }) => kind !== "duplicate_charge",
    ),
  );
});

test("a healthy account produces zero hypotheses", () => {
  const clean = getCleanFixture(FIXED_NOW);
  assert.deepEqual(generateHypotheses(clean, FIXED_NOW), []);
});

test("Path A is locked: four words rank duplicate charge first", async () => {
  const ranked = rankMaria("order wrong thing help");
  assert.deepEqual(
    ranked.map(({ kind }) => kind),
    ["duplicate_charge", "wrong_item", "prior_ticket_followup"],
  );
  assert.deepEqual(
    ranked.map(({ id }) => id),
    [
      "duplicate-charge-ch_9002",
      "wrong-item-A-4471",
      "ticket-followup-3312",
    ],
  );
  assert.deepEqual(
    ranked.map(({ semanticScore }) => semanticScore),
    [0.98, 0.68, 0.08],
  );
  assert.deepEqual(
    ranked.map(({ recencyBoost }) => recencyBoost),
    [0.25, 0.5, 0],
  );
  assert.deepEqual(
    ranked.map(({ finalScore }) => Number(finalScore.toFixed(3))),
    [1.542, 1.472, 0.382],
  );
  assert.equal(countWords("order wrong thing help"), 4);

  const legacy = await legacyResponse("order wrong thing help", false);
  assert.deepEqual(legacy, {
    value: LEGACY_GOLDEN_RESPONSE,
    source: "fixture",
  });
});

test("the original five-word Path A phrase remains a locked compatibility path", async () => {
  assert.deepEqual(
    rankMaria("order wrong the thing help").map(({ kind }) => kind),
    ["duplicate_charge", "wrong_item", "prior_ticket_followup"],
  );
  assert.equal(countWords("order wrong the thing help"), 5);
  assert.equal(
    (await legacyResponse("order wrong the thing help", false)).value,
    LEGACY_GOLDEN_RESPONSE,
  );
});

test("Path B is locked: circumlocution ranks the recent kettle first", async () => {
  const ranked = rankMaria("the boily thing broke");
  assert.deepEqual(
    ranked.map(({ kind }) => kind),
    ["wrong_item", "duplicate_charge", "prior_ticket_followup"],
  );
  assert.deepEqual(
    ranked.map(({ semanticScore }) => semanticScore),
    [0.81, 0.08, 0],
  );
  assert.deepEqual(
    ranked.map(({ finalScore }) => Number(finalScore.toFixed(3))),
    [1.524, 1.182, 0.35],
  );
  assert.match(ranked[0].detail, /Ceramic kettle, 1\.7L/);
  assert.equal(
    (await legacyResponse("the boily thing broke", false)).value,
    LEGACY_GOLDEN_RESPONSE,
  );
});

test("Path C is locked: no words still yields three account-state choices", async () => {
  const ranked = rankMaria("");
  assert.deepEqual(
    ranked.map(({ kind }) => kind),
    ["duplicate_charge", "wrong_item", "prior_ticket_followup"],
  );
  assert.deepEqual(
    ranked.map(({ semanticScore }) => semanticScore),
    [0, 0, 0],
  );
  assert.deepEqual(
    ranked.map(({ finalScore }) => Number(finalScore.toFixed(2))),
    [1.15, 0.95, 0.35],
  );
  assert.equal(countWords(""), 0);
  assert.equal((await legacyResponse("", false)).value, LEGACY_GOLDEN_RESPONSE);
});

test("Unicode-aware word counting handles composed text and ignores emoji", () => {
  assert.equal(countWords("cafe\u0301"), 1);
  assert.equal(countWords("I can’t find kettle"), 4);
  assert.equal(countWords("水 hot thing"), 3);
  assert.equal(countWords("🫖🙂"), 0);
  assert.equal(countWords("  déjà-vu   again  "), 3);
});

test("action tokens verify intact payloads and reject forged signatures", async () => {
  const token = await signActionToken({
    requestId: "request-test-1",
    candidateId: "duplicate-charge-ch_9002",
    email: "maria@example.com",
    mode: "demo",
  });
  const verified = await verifyActionToken(token);
  assert.ok(verified);
  assert.equal(verified.requestId, "request-test-1");
  assert.equal(verified.candidateId, "duplicate-charge-ch_9002");
  assert.equal(verified.email, "maria@example.com");
  assert.equal(verified.mode, "demo");
  assert.ok(verified.expiresAt > Date.now());

  const [payload, signature] = token.split(".");
  const forgedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  assert.equal(await verifyActionToken(`${payload}.${forgedSignature}`), null);

  const forgedPayload = `${payload[0] === "A" ? "B" : "A"}${payload.slice(1)}`;
  assert.equal(await verifyActionToken(`${forgedPayload}.${signature}`), null);
  assert.equal(await verifyActionToken(`${token}.extra`), null);

  const realDateNow = Date.now;
  const issuedAt = realDateNow();
  try {
    Date.now = () => issuedAt;
    const expiringToken = await signActionToken({
      requestId: "request-expiry-test",
      candidateId: "duplicate-charge-ch_9002",
      email: "maria@example.com",
      mode: "demo",
    });
    Date.now = () => issuedAt + 10 * 60_000 + 1;
    assert.equal(await verifyActionToken(expiringToken), null);
  } finally {
    Date.now = realDateNow;
  }
});
