import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { RULE_PROVENANCE } from "../lib/rule-provenance.generated";

test("the Wordless offline ticket corpus and committed provenance agree", async () => {
  const corpusSource = await readFile(
    new URL("../data/ticket-corpus.json", import.meta.url),
    "utf8",
  );
  const corpus = JSON.parse(corpusSource) as {
    schemaVersion: string;
    records: Array<{
      ticketId: string;
      fictional: boolean;
      style: string;
      accountStateAtContact: { email: string };
      expectedResolution: { kind: string };
    }>;
  };

  assert.equal(corpus.schemaVersion, "wordless-ticket-corpus.v1");
  assert.equal(RULE_PROVENANCE.schemaVersion, "wordless-rule-provenance.v1");
  assert.equal(corpus.records.length, 384);
  assert.equal(new Set(corpus.records.map(({ ticketId }) => ticketId)).size, 384);
  assert.ok(corpus.records.every(({ fictional }) => fictional));
  assert.ok(
    corpus.records.every(({ accountStateAtContact }) =>
      accountStateAtContact.email.endsWith("@example.invalid"),
    ),
  );

  const expectedKinds = [
    "duplicate_charge",
    "wrong_item",
    "late_delivery",
    "unexpected_renewal",
    "refund_pending",
    "clean_state",
  ];
  for (const kind of expectedKinds) {
    const records = corpus.records.filter(
      ({ expectedResolution }) => expectedResolution.kind === kind,
    );
    assert.equal(records.length, 64);
    assert.deepEqual(
      [...new Set(records.map(({ style }) => style))].sort(),
      ["circumlocution", "fluent", "fragment", "misspelling"],
    );
  }

  const corpusHash = createHash("sha256").update(corpusSource).digest("hex");
  assert.equal(RULE_PROVENANCE.corpusSha256, corpusHash);
  assert.equal(RULE_PROVENANCE.totalRecords, corpus.records.length);
  assert.equal(RULE_PROVENANCE.runtimeCorpusDependency, false);
});
