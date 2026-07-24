import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { POST as actPOST } from "../app/api/act/route";
import { POST as resolvePOST } from "../app/api/resolve/route";
import { verifyActionToken } from "../lib/action-token";
import {
  COMPOSIO_READ_TOOLS,
  COMPOSIO_WRITE_TOOLS,
} from "../lib/composio";
import { getOctenSimilarityScores } from "../lib/octen";
import { getCleanFixture } from "../lib/fixtures";
import { hypothesesForPipeline, streamResolution } from "../lib/pipeline";
import type { Hypothesis, PipelineEvent } from "../lib/types";

function hypothesis(id: string, title: string): Hypothesis {
  return {
    id,
    kind: id,
    title,
    detail: `${title} has a concrete account fact.`,
    evidence: ["Contract fixture"],
    occurredAt: "2026-01-15T12:00:00.000Z",
    baseScore: 0.5,
    variants: [`${title} other words`],
    action: {
      kind: "trace_delivery",
      label: "Trace this delivery",
      orderId: `order-${id}`,
    },
  };
}

function restoreEnvironment(
  snapshot: Record<string, string | undefined>,
): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function collectResolution(
  fragment: string,
  email = "maria@example.com",
): Promise<PipelineEvent[]> {
  const events: PipelineEvent[] = [];
  for await (const event of streamResolution({
    email,
    fragment,
    requestedDemoMode: true,
  })) {
    events.push(event);
  }
  return events;
}

function terminalEvent(
  events: PipelineEvent[],
): Extract<PipelineEvent, { t: "candidates" }> {
  const terminal = events.at(-1);
  assert.ok(terminal, "the resolution stream must emit at least one event");
  assert.equal(terminal.t, "candidates", "candidates must be the terminal event");
  return terminal as Extract<PipelineEvent, { t: "candidates" }>;
}

function parseSse(source: string): Array<{
  event: string;
  data: PipelineEvent;
}> {
  return source
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const event = lines
        .find((line) => line.startsWith("event:"))
        ?.slice("event:".length)
        .trim();
      const payload = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trimStart())
        .join("\n");
      assert.ok(event, "every SSE block must name its event");
      assert.ok(payload, "every SSE block must carry JSON data");
      const data = JSON.parse(payload) as PipelineEvent;
      assert.equal(event, data.t);
      return { event, data };
    });
}

test("a clean account becomes one explicit human handoff at the pipeline boundary", () => {
  const choices = hypothesesForPipeline(
    getCleanFixture(new Date("2026-01-15T12:00:00.000Z")),
    "different help words",
    new Date("2026-01-15T12:00:00.000Z"),
  );

  assert.equal(choices.length, 1);
  assert.equal(choices[0].kind, "human_handoff");
  assert.equal(choices[0].title, "Talk to a person");
  assert.deepEqual(choices[0].action, {
    kind: "escalate_support",
    label: "Send this to a person",
    fragment: "different help words",
  });
});

test("Octen sends separate query/document contracts, sorts vectors, and caches documents", async () => {
  const env = {
    OCTEN_API_KEY: process.env.OCTEN_API_KEY,
    OCTEN_EMBEDDING_MODEL: process.env.OCTEN_EMBEDDING_MODEL,
    OCTEN_EMBEDDING_DIMENSION: process.env.OCTEN_EMBEDDING_DIMENSION,
  };
  const originalFetch = globalThis.fetch;
  const requests: Array<{
    url: string;
    init: RequestInit;
    body: Record<string, unknown>;
  }> = [];

  process.env.OCTEN_API_KEY = "octen-contract-key";
  process.env.OCTEN_EMBEDDING_MODEL = "octen-embedding-4b";
  process.env.OCTEN_EMBEDDING_DIMENSION = "64";
  globalThis.fetch = async (input, init = {}) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    requests.push({ url: String(input), init, body });
    const isQuery = body.input_type === "query";
    return new Response(
      JSON.stringify({
        code: 0,
        msg: "ok",
        data: {
          // Return document vectors out of order to verify index handling.
          results: isQuery
            ? [{ index: 0, embedding: [1, 0] }]
            : [
                { index: 1, embedding: [0, 1] },
                { index: 0, embedding: [1, 0] },
              ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const candidates = [
      hypothesis("octen-contract-a", "The kettle arrived"),
      hypothesis("octen-contract-b", "The delivery is late"),
    ];
    const first = await getOctenSimilarityScores("boily thing", candidates);
    const second = await getOctenSimilarityScores("hot water thing", candidates);

    assert.deepEqual(first, {
      "octen-contract-a": 1,
      "octen-contract-b": 0,
    });
    assert.deepEqual(second, first);
    assert.equal(requests.length, 3, "two query calls plus one cached document call");

    const queryRequests = requests.filter(
      ({ body }) => body.input_type === "query",
    );
    const documentRequests = requests.filter(
      ({ body }) => body.input_type === "document",
    );
    assert.equal(queryRequests.length, 2);
    assert.equal(documentRequests.length, 1);
    assert.deepEqual(queryRequests[0].body.input, ["boily thing"]);
    assert.deepEqual(queryRequests[1].body.input, ["hot water thing"]);
    assert.deepEqual(documentRequests[0].body.input, [
      "The kettle arrived. The kettle arrived has a concrete account fact.. The kettle arrived other words",
      "The delivery is late. The delivery is late has a concrete account fact.. The delivery is late other words",
    ]);

    for (const request of requests) {
      assert.equal(request.url, "https://api.octen.ai/embedding");
      assert.equal(request.init.method, "POST");
      assert.ok(request.init.signal instanceof AbortSignal);
      const headers = new Headers(request.init.headers);
      assert.equal(headers.get("content-type"), "application/json");
      assert.equal(headers.get("x-api-key"), "octen-contract-key");
      assert.equal(request.body.model, "octen-embedding-4b");
      assert.equal(request.body.dimension, 64);
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(env);
  }
});

test("Octen rejects malformed vector responses instead of ranking with corrupt data", async () => {
  const env = { OCTEN_API_KEY: process.env.OCTEN_API_KEY };
  const originalFetch = globalThis.fetch;
  process.env.OCTEN_API_KEY = "octen-malformed-key";
  globalThis.fetch = async (_input, init = {}) => {
    const body = JSON.parse(String(init.body)) as { input_type: string };
    return new Response(
      JSON.stringify({
        code: 0,
        msg: "ok",
        data: {
          results:
            body.input_type === "query"
              ? [{ index: 0, embedding: [1, 0] }]
              : [
                  { index: 0, embedding: [1, 0] },
                  { index: 1, embedding: [1] },
                ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    await assert.rejects(
      getOctenSimilarityScores("malformed test", [
        hypothesis("octen-malformed-a", "First malformed candidate"),
        hypothesis("octen-malformed-b", "Second malformed candidate"),
      ]),
      /Octen returned a malformed vector/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(env);
  }
});

test("Composio keeps merchant identity, connections, and read/write tools statically scoped", async () => {
  const source = await readFile(
    new URL("../lib/composio.ts", import.meta.url),
    "utf8",
  );

  assert.deepEqual(COMPOSIO_READ_TOOLS, {
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
  });
  assert.deepEqual(COMPOSIO_WRITE_TOOLS, {
    stripe: ["STRIPE_CREATE_REFUND"],
    zendesk: [
      "ZENDESK_CREATE_ZENDESK_TICKET",
      "ZENDESK_UPDATE_ZENDESK_TICKET",
    ],
  });

  assert.equal(
    source.match(/composio\.sessions\.create\(\s*config\.merchantUserId/g)?.length,
    2,
    "both sessions must be owned by the configured merchant user",
  );
  assert.doesNotMatch(source, /composio\.sessions\.create\(\s*email\b/);
  assert.equal(source.match(/sessionPreset:\s*"direct_tools"/g)?.length, 2);
  assert.equal(source.match(/manageConnections:\s*false/g)?.length, 2);
  assert.equal(
    source.match(/sandbox:\s*\{\s*enable:\s*false\s*\}/g)?.length,
    2,
  );
  assert.match(source, /toolkits:\s*\["shopify",\s*"stripe",\s*"zendesk"\]/);
  assert.match(source, /toolkits:\s*\["stripe",\s*"zendesk"\]/);
  assert.match(source, /shopify:\s*\[config\.shopifyAccountId\]/);
  assert.match(source, /stripe:\s*\[config\.stripeAccountId\]/);
  assert.match(source, /zendesk:\s*\[config\.zendeskAccountId\]/);
  assert.doesNotMatch(source, /GMAIL|OUTLOOK|SLACK|GOOGLECALENDAR/i);
});

test("Path A streams exact account evidence, three Wordless choices, and a rejected late rule", async () => {
  const events = await collectResolution("order wrong thing help");
  const terminal = terminalEvent(events);

  assert.deepEqual(
    terminal.cards.map(({ kind }) => kind),
    ["duplicate_charge", "wrong_item", "prior_ticket_followup"],
  );
  assert.deepEqual(terminal.cards, terminal.response.candidates);
  assert.equal(terminal.response.mode, "demo");
  assert.equal(terminal.response.requestedMode, "demo");
  assert.deepEqual(terminal.response.providers, {
    composio: "fixture",
    octen: "fixture",
    openai: "fixture",
  });

  const reasoning = events
    .filter((event): event is Extract<PipelineEvent, { t: "reason_line" }> =>
      event.t === "reason_line",
    )
    .map(({ text }) => text);
  assert.ok(
    reasoning.some((line) =>
      /Two charges of \$84\.00, both on .+, 40 seconds apart\./.test(line),
    ),
  );
  assert.ok(reasoning.includes("Nothing is overdue."));
  assert.ok(
    reasoning.includes("Late delivery does not fire. Nothing is actually late."),
  );

  const lateRule = events.find(
    (event): event is Extract<PipelineEvent, { t: "hypothesis" }> =>
      event.t === "hypothesis" && event.kind === "late_delivery",
  );
  assert.ok(lateRule);
  assert.equal(lateRule.fired, false);
  assert.equal(lateRule.total, 0);
  assert.equal(lateRule.why, "nothing is past its promised date");
});

test("Path B shows literal keyword 0.00 versus Octen meaning 0.81", async () => {
  const events = await collectResolution("the boily thing broke");
  const terminal = terminalEvent(events);
  assert.deepEqual(
    terminal.cards.map(({ kind }) => kind),
    ["wrong_item", "duplicate_charge", "prior_ticket_followup"],
  );

  const itemComparison = events.find(
    (event): event is Extract<PipelineEvent, { t: "semantic" }> =>
      event.t === "semantic" && event.target === "wrong_item",
  );
  assert.deepEqual(itemComparison, {
    t: "semantic",
    token: "boily thing",
    target: "wrong_item",
    keyword: 0,
    octen: 0.81,
  });
  assert.ok(
    events.some(
      (event) =>
        event.t === "reason_line" &&
        event.text === "Keyword matching scores 0.00 against all five. It finds nothing.",
    ),
  );
});

test("Path C skips Octen, uses zero words, and still terminates with account choices", async () => {
  const events = await collectResolution("");
  const terminal = terminalEvent(events);
  assert.deepEqual(
    terminal.cards.map(({ kind }) => kind),
    ["duplicate_charge", "wrong_item", "prior_ticket_followup"],
  );

  const semantics = events.filter(
    (event): event is Extract<PipelineEvent, { t: "semantic" }> =>
      event.t === "semantic",
  );
  assert.ok(semantics.length > 0);
  assert.ok(
    semantics.every(
      ({ token, keyword, octen }) => token === "" && keyword === 0 && octen === 0,
    ),
  );
  const octenDone = events.find(
    (event): event is Extract<PipelineEvent, { t: "stage_done" }> =>
      event.t === "stage_done" && event.tool === "octen",
  );
  assert.ok(octenDone);
  assert.equal(octenDone.state, "skipped");
  assert.equal(octenDone.source, "skipped");
  assert.equal(octenDone.ms, 0);
  assert.equal(octenDone.summary, "no fragment; account evidence only");
});

test("Wordless fixture streaming makes zero external calls for arbitrary input", async () => {
  const env = {
    WORDLESS_ALLOW_LIVE_MODE: process.env.WORDLESS_ALLOW_LIVE_MODE,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OCTEN_API_KEY: process.env.OCTEN_API_KEY,
    COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  process.env.WORDLESS_ALLOW_LIVE_MODE = "true";
  process.env.OPENAI_API_KEY = "must-not-be-used";
  process.env.OCTEN_API_KEY = "must-not-be-used";
  process.env.COMPOSIO_API_KEY = "must-not-be-used";
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fixture mode attempted a network request");
  };

  try {
    const events = await collectResolution(
      "🫖 judge words that are not a golden fixture",
    );
    const terminal = terminalEvent(events);
    const result = terminal.response;

    assert.equal(fetchCalls, 0);
    assert.equal(result.mode, "demo");
    assert.equal(result.requestedMode, "demo");
    assert.equal(result.candidates.length, 3);
    assert.deepEqual(terminal.cards, result.candidates);
    assert.deepEqual(result.providers, {
      composio: "fixture",
      octen: "fixture",
      openai: "fixture",
    });

    for (const candidate of result.candidates) {
      const token = await verifyActionToken(candidate.actionToken);
      assert.ok(token);
      assert.equal(token.requestId, result.requestId);
      assert.equal(token.candidateId, candidate.id);
      assert.equal(token.email, "maria@example.com");
      assert.equal(token.mode, "demo");
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment(env);
  }
});

test("the resolve route frames the pipeline as SSE and ends with candidates", async () => {
  const response = await resolvePOST(
    new Request("http://wordless.test/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "maria@example.com",
        fragment: "order wrong thing help",
        demoMode: true,
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.equal(response.headers.get("x-accel-buffering"), "no");
  assert.match(response.headers.get("cache-control") ?? "", /no-transform/);

  const frames = parseSse(await response.text());
  assert.ok(frames.length > 3);
  const lastFrame = frames.at(-1);
  assert.ok(lastFrame);
  assert.equal(lastFrame.event, "candidates");
  assert.equal(lastFrame.data.t, "candidates");
  if (lastFrame.data.t !== "candidates") {
    assert.fail("the final SSE payload must be a candidates event");
  }
  assert.equal(lastFrame.data.cards.length, 3);
  assert.deepEqual(lastFrame.data.cards, lastFrame.data.response.candidates);
});

test("resolution is read-only until an explicit action request uses a signed card token", async () => {
  const events = await collectResolution("order wrong thing help");
  assert.equal(
    events.some(
      (event) =>
        (event.t === "stage_start" || event.t === "stage_done") &&
        event.tool === "zendesk",
    ),
    false,
    "resolution must not start a write stage",
  );

  const terminal = terminalEvent(events);
  const selected = terminal.cards[0];
  const token = await verifyActionToken(selected.actionToken);
  assert.ok(token);
  assert.equal(token.requestId, terminal.response.requestId);
  assert.equal(token.candidateId, selected.id);

  const actionResponse = await actPOST(
    new Request("http://wordless.test/api/act", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionToken: selected.actionToken }),
    }),
  );
  assert.equal(actionResponse.status, 200);
  assert.equal(actionResponse.headers.get("cache-control"), "no-store");
  const receipt = (await actionResponse.json()) as {
    status: string;
    title: string;
    source: string;
  };
  assert.deepEqual(receipt, {
    status: "completed",
    title: "Done. Refund of $84.00 sent.",
    source: "fixture",
    detail: "The duplicate charge is going back to the original card.",
    reference: "Stripe refund re_3PqX · Zendesk ticket #4471 closed",
  });
});
