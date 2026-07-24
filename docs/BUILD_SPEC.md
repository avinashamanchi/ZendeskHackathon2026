# Wordless — Implemented Build Specification

> This document is the authoritative implementation and acceptance contract for Wordless. It reworks the supplied build prompt around the system that is actually present in this repository. When the source prompt and the implementation disagree, this document records the coherent, testable behavior to preserve.

## 1. Product thesis

A person with expressive aphasia may understand written language while being unable to retrieve the words needed to ask for support. Conventional support begins with a fluent description. Wordless begins with the merchant account already attached to the request.

Wordless must:

1. Read merchant-owned account records, never a customer’s personal inbox.
2. Detect only account states supported by those records.
3. Use any available fragment—including zero words—to rank those states.
4. Show no more than three large, plain-language choices.
5. Perform no write until the person explicitly activates a choice.
6. Recover to a complete fixture experience instead of hanging, crashing, or presenting an empty result.

The scope test remains simple: if a change does not reduce the need to find or compose words, it does not belong on the customer surface.

## 2. Two surfaces, two audiences

Wordless deliberately separates the interface into two zones.

### Customer surface

The customer surface contains:

- one short fragment input;
- the account identity already attached to the request;
- a deliberately bad description-first chatbot answer;
- three large selectable cards;
- words and turns meters; and
- a receipt after an explicit selection.

It does not contain provider jargon, scores, raw JSON, timing detail, or internal reasoning.

### Judge surface

The judge surface contains:

- the Composio → Octen → Codex → Zendesk rail;
- deterministic reasoning narration;
- normalized evidence rows and raw fixture/provider objects;
- fired and rejected hypothesis rows;
- keyword-versus-Octen scores; and
- the visibly marked write path.

The whole judge surface is `aria-hidden="true"`. It is a demonstration aid, not part of the assistive interaction.

## 3. Reconciliation of the supplied prompt

These are intentional corrections and clarifications.

### 3.1 The primary phrase has five words

The exact default is:

```text
order wrong the thing help
```

It contains five words, not four. The meter and reasoning stream must report `5`. The shorter compatibility phrase `order wrong thing help` remains locked in the ranker, but it is not the primary displayed path.

### 3.2 Maria has exactly two orders

Do not add a synthetic late third order to Maria. Her fixture contains:

- recent delivered kettle order `A-4471`;
- old delivered mug order `A-4390`;
- three successful charges; and
- one solved prior ticket.

That account produces three truthful customer choices without inventing a late shipment.

### 3.3 The duplicate charges are 40 seconds apart

`ch_9001` is six days before the request. `ch_9002` is six days minus 40 seconds before the request. They have the same amount, order, and successful status. The reasoning stream must state `40 seconds apart` from the actual timestamps.

### 3.4 Maria’s three cards are not three diagnoses

The three customer choices are:

1. `duplicate_charge` — **You were charged twice** — an observed billing state.
2. `wrong_item` — **Something's wrong with what arrived** — an interpretation supported by the fragment and a recent kettle delivery, for Maria to confirm.
3. `prior_ticket_followup` — **You contacted us before** — an observed recent solved support contact.

The account proves that the kettle arrived recently; it does not independently prove damage or a fulfillment mismatch. The card is a selectable meaning, not an automatic conclusion or action.

### 3.5 Late delivery is rejected, not shown as a card

Maria has no overdue order. The engine must still render the `late_delivery` rule in the score panel as:

```text
not fired · nothing is past its promised date
```

Path A may show low semantic proximity for late-delivery language, but semantic similarity cannot create a missing account condition.

### 3.6 Dates are relative, structure is deterministic

Fixture timestamps resolve against the current request time. Therefore displayed calendar dates advance over time. The records, 40-second gap, age offsets, detector outcomes, locked semantic scores, and ordering remain deterministic.

Do not claim that calendar pixels are identical forever.

### 3.7 Offline means a prebuilt local application

A hosted URL cannot cold-load after WAN disconnection without a service worker. Wordless guarantees the golden paths when the compiled application is already available on loopback. The browser also has a complete local fixture fallback after the page has loaded.

### 3.8 Simulated latency is labeled simulation

Demo timing values are deterministic metadata, not measured provider calls. Every simulated stage carries `source: "fixture"`, `state: "fixtures"`, and `simulated: true`; the rail renders a `sim` marker.

### 3.9 Provider implementation is not provider-account verification

The repository contains real adapters and mocked contract coverage. No credentialed live smoke test against an actual Composio merchant, Stripe account, Zendesk account, Octen key, or OpenAI project is claimed.

## 4. Definition of done

A Wordless release is ready only when:

- Path A reports five words and one turn.
- Maria’s cards are duplicate charge, wrong item, and prior contact in that order.
- The duplicate evidence and narration show a 40-second gap.
- Late delivery appears only as a rejected rule for Maria.
- Path B shows keyword `0.00` and Octen `0.81` for the kettle.
- Path C reports zero words and still returns three cards.
- Arbitrary input for the fixture identity terminates with three cards.
- `POST /api/resolve` is a valid SSE stream whose final event is `candidates`.
- Demo mode makes no provider call.
- Every fixture or recovered timing is visibly identified as simulated/fallback.
- No read path executes an action.
- A live write requires an explicit card activation, a valid signed token, coherent live account data, and both server gates.
- An uncertain live action never produces a success claim.
- Keyboard navigation, focus movement, reduced motion, responsive reflow, and development axe checks are reviewed.
- Type checking, linting, tests, and the production build pass in the release environment.

## 5. Stack and project constraints

The initialized project is preserved:

- Next.js App Router on React 19;
- TypeScript with strict checking;
- Tailwind CSS 4 plus project CSS;
- vinext/Vite output for Cloudflare Workers;
- `@composio/core` 0.14.0;
- OpenAI JavaScript SDK 6.49.0;
- direct Octen REST calls;
- Zod structured-output validation;
- `@axe-core/react` in development; and
- no database, state library, component library, or authentication UI.

Node.js 22.22.3 or newer is required by the pinned dependency set.

The Sites configuration keeps D1 and R2 disabled. A hosted public build remains fixture-only unless an operator adds an appropriate access layer outside this demo.

## 6. System architecture

```text
WordlessDemo client
  ├─ POST /api/resolve (text/event-stream)
  │    └─ streamResolution
  │         ├─ fixture or Composio account snapshot
  │         ├─ committed offline detector catalogue
  │         ├─ local or live Octen semantic scores
  │         ├─ deterministic top-three ranking
  │         ├─ deterministic narration
  │         ├─ fixture or optional OpenAI copy
  │         └─ short-lived signed card intents
  │
  ├─ client-side visual event queue
  │    ├─ reasoning character stream
  │    ├─ evidence rows
  │    ├─ score rows
  │    └─ tool-rail state
  │
  └─ POST /api/act (JSON, only after a card tap)
       ├─ validate HMAC token
       ├─ reload coherent account snapshot
       ├─ regenerate and revalidate selected hypothesis
       └─ fixture receipt or allowlisted Composio write
```

Runtime ownership:

- `components/WordlessDemo.tsx` parses SSE and owns presentation pacing.
- `lib/pipeline.ts` owns server resolution order and terminal cards.
- `lib/reasoning.ts` turns real pipeline values into deterministic narration.
- `lib/hypotheses.generated.ts` owns detector conditions and server actions.
- `lib/rank.ts` owns scoring and top-three ordering.
- `lib/composio.ts` owns merchant integration and payload normalization.
- `lib/octen.ts` owns the embedding HTTP contract and vector validation.
- `lib/llm.ts` owns optional card/legacy copy and validation.
- `lib/action-token.ts` owns short-lived signed intents.
- `lib/resolve.ts` remains the action revalidation path and a non-streaming orchestration helper.

## 7. Domain and trust boundaries

Money is stored in cents. Runtime dates are ISO 8601 strings. Provider payloads must be normalized into `AccountState` before detection.

The server-owned action union contains only:

- `refund_duplicate`;
- `replace_item`;
- `trace_delivery`;
- `review_renewal`;
- `trace_refund`; and
- `continue_ticket`.

A `Hypothesis` contains its concrete evidence, score inputs, variants, and `ActionSpec`. A `CandidateView` deliberately removes the action object and semantic variants. The browser receives:

- candidate id and kind;
- title and detail;
- evidence strings;
- event date;
- action label; and
- a signed opaque action token.

The browser never chooses a Composio tool slug, refund amount, charge id, ticket id, or provider argument object.

The judge surface does receive normalized raw evidence objects for demonstration. This is safe for the committed fictional fixtures. Because the same path would expose real merchant records in live mode, live deployment must be access-controlled and privacy-reviewed.

## 8. Fixtures

All relative values are resolved at request time.

### 8.1 Maria O. — primary fixture

Identity:

```text
maria@example.com
```

Orders:

| Order | State | Timing | Item | Total |
| --- | --- | --- | --- | --- |
| `A-4471` | delivered | placed 6d ago, delivered 2d ago | Ceramic kettle, 1.7L | $84.00 |
| `A-4390` | delivered | placed 31d ago, delivered 27d ago | Stoneware mug, set of 2 | $32.00 |

Charges:

| Charge | Amount | Timing | State | Order |
| --- | --- | --- | --- | --- |
| `ch_9001` | $84.00 | 518,400 seconds ago | succeeded | `A-4471` |
| `ch_9002` | $84.00 | 518,360 seconds ago | succeeded | `A-4471` |
| `ch_8800` | $32.00 | 31 days ago | succeeded | `A-4390` |

The first two entries are exactly 40 seconds apart.

Other records:

- no subscriptions;
- no refunds; and
- solved ticket `#3312`, “where is my order,” created 20 days ago and linked to `A-4390`.

Generated hypotheses:

| Kind | Base | Why it fires | Customer action |
| --- | ---: | --- | --- |
| `duplicate_charge` | 0.90 | Two successful same-order, same-amount charges within 60 minutes | Refund the duplicate charge |
| `wrong_item` | 0.70 | A delivered item is within the 14-day contact window; fragment meaning supplies the interpretation | Replace the recent item |
| `prior_ticket_followup` | 0.35 | A solved support contact exists within 30 days | Continue the earlier ticket |

Rejected core rules include late delivery, renewal, and pending refund.

### 8.2 Sam R.

Sam has:

- an active Home essentials plan renewed three days ago for $24.00;
- a pending $58.00 refund initiated nine days ago; and
- pending ticket `#3398` about the missing refund.

The supported hypotheses are unexpected renewal, pending refund, and prior-ticket follow-up.

### 8.3 Jo L.

Jo has:

- order `A-4520`, placed eleven days ago and promised four days ago;
- status `in_transit`;
- no tracking update for five days;
- one successful $46.00 charge; and
- open ticket `#3411` about the passed delivery date.

The supported hypotheses are late delivery, stalled tracking, and prior-ticket follow-up.

### 8.4 Clean fixture

The clean fixture contains only an old delivered order and one matching successful charge. It must produce zero hypotheses in domain tests.

The current public route exposes only the three fixture identities and the visible interface uses Maria. The clean fixture still proves that the detector catalogue returns zero hypotheses. At the pipeline boundary, zero hypotheses become one explicit `Talk to a person` candidate; activating it creates a Zendesk handoff with the cleaned fragment attached. Wordless never substitutes an unrelated account state or shows an empty screen.

## 9. Detector catalogue

The committed detector catalogue is runtime truth. It does not call a model or read the corpus during a request.

| Detector | Condition |
| --- | --- |
| Duplicate charge | Two successful charges with equal amount and order id no more than 60 minutes apart |
| Wrong item | Delivered order with contact within 14 days |
| Late delivery | `promisedBy` is in the past and status is not delivered |
| Tracking stalled | In transit and last tracking update is older than 72 hours |
| Unexpected renewal | Active subscription renewed within seven days |
| Refund pending | Refund initiated more than five days ago and not settled |
| Prior-ticket follow-up | Any prior ticket within 30 days; open/pending base is 0.50, solved/closed base is 0.35 |

Important epistemic rule: firing `wrong_item` identifies a recent item that could be what the person means. It does not automatically assert provider fault. The person must select it before replacement handling begins.

## 10. Ranking

For each fired hypothesis:

```text
final = base + recency + (0.4 × semantic similarity)
```

Recency is:

- `0.50` within 72 hours;
- `0.25` within seven days; and
- `0.00` otherwise.

For a zero-word request, recency is capped at `0.25` so observed high-base account states remain dominant.

Only fired account hypotheses can become cards. Missing core rules may still receive semantic comparison rows, but they remain `fired: false` and cannot enter the ranking.

### 10.1 Path A scores

For `order wrong the thing help`:

| Kind | Base | Recency | Raw semantic | Weighted semantic | Total | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `duplicate_charge` | .90 | .25 | .98 | .39 | 1.54 | card 1 |
| `wrong_item` | .70 | .50 | .68 | .27 | 1.47 | card 2 |
| `prior_ticket_followup` | .35 | .00 | .08 | .03 | .38 | card 3 |
| `late_delivery` | .80 | — | .15 display comparison | — | — | not fired |

The `hypothesis.semantic` SSE field carries the weighted contribution. The `semantic.octen` field carries raw similarity.

### 10.2 Path B scores

For `the boily thing broke`:

- literal keyword comparison is `0.00` for all five core detector targets;
- raw semantic similarity is `0.81` for `wrong_item`/the kettle;
- `wrong_item` totals approximately `1.52` and ranks first;
- duplicate charge totals approximately `1.18`; and
- prior-ticket follow-up remains third.

The prior-ticket comparison can appear as an additional row because it is a real fired account hypothesis beyond the five core comparison targets.

### 10.3 Path C scores

With no fragment:

- Octen is skipped;
- all semantic scores are zero;
- duplicate charge totals `1.15`;
- wrong item totals `0.95`; and
- solved prior contact totals `0.35`.

## 11. Octen semantics

The live adapter calls:

```http
POST https://api.octen.ai/embedding
Content-Type: application/json
x-api-key: <server key>
```

Request shape:

```json
{
  "input": ["text"],
  "model": "octen-embedding-4b",
  "dimension": 256,
  "input_type": "query"
}
```

Document calls use `input_type: "document"`. Wordless validates response code, count, index ordering, vector dimensions, and finite values. Document vectors are cached in memory by model, dimension, and document content. Wordless computes cosine similarity and clamps it to `[0, 1]`.

The document text is `title + detail + variants`. It can contain concrete amounts, dates, item names, and order identifiers. This live data boundary requires an operator privacy and provider-terms review.

Demo mode never calls Octen. It uses committed scores for the golden paths and local token/trigram matching for arbitrary fragments. Empty input skips the stage. If live Octen fails, the pipeline emits a recovered error and retains the local scores.

For a golden fragment in requested live mode, the adapter may measure a real embedding call while retaining the committed golden scores. Its stage summary explicitly says `live embedding measured; golden scores held stable`; it must not imply those displayed scores came from that response.

No credentialed Octen request has been claimed for this build.

## 12. SSE contract

`POST /api/resolve` responds with:

```http
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-store, no-transform
X-Accel-Buffering: no
```

Each block includes both an SSE event name and JSON data:

```text
event: evidence
data: {"t":"evidence",...}

```

The discriminated union is:

```ts
type PipelineEvent =
  | {
      t: "stage_start";
      tool: "composio" | "octen" | "codex" | "zendesk";
      label: string;
      source: "fixture" | "live" | "fallback" | "skipped";
      state: "running";
      simulated: boolean;
    }
  | {
      t: "stage_done";
      tool: "composio" | "octen" | "codex" | "zendesk";
      ms: number;
      summary: string;
      source: "fixture" | "live" | "fallback" | "skipped";
      state: "done" | "fixtures" | "fallback" | "skipped";
      simulated: boolean;
    }
  | { t: "reason_head"; text: string }
  | { t: "reason_line"; text: string }
  | {
      t: "evidence";
      source: string;
      line: string;
      raw: Record<string, unknown>;
      hit: boolean;
    }
  | {
      t: "hypothesis";
      kind: string;
      base: number;
      recency: number;
      semantic: number;
      total: number;
      fired: boolean;
      why: string;
    }
  | {
      t: "semantic";
      token: string;
      target: string;
      keyword: number;
      octen: number;
    }
  | {
      t: "candidates";
      cards: CandidateView[];
      response: ResolveResponse;
    }
  | {
      t: "error";
      tool: "composio" | "octen" | "codex" | "zendesk";
      recovered: true;
      source: "fallback";
      state: "fallback";
    };
```

Normal order:

1. Composio stage start and account-opening narration.
2. Evidence records and Composio stage completion.
3. Account findings narration.
4. Octen stage start, semantic comparisons, and completion.
5. Fragment narration, decision narration, and hypothesis rows.
6. Codex stage start, choice-writing narration, and completion.
7. Terminal `candidates` event.

The terminal event repeats the card array and includes the complete `ResolveResponse` for legacy copy, provider provenance, effective mode, and account name. Signed tokens are the exact same values in both locations.

No event exposes a provider exception or secret. A recovered provider failure emits only the tool and recovery state. If the pipeline itself fails, the route emits one recovered error followed by a complete local fixture `candidates` event. `candidates` remains terminal.

The route normalizes Unicode, removes control characters, limits the fragment to 280 code points, and allows only the committed fixture emails.

## 13. Pipeline timing and narration

The server sends events promptly. The browser owns the show pacing so presenter mode can stop between stages.

### 13.1 Simulated stage metadata

Fixture latencies are deterministic hashes of tool, fixture email, and normalized fragment:

| Stage | Range |
| --- | ---: |
| Composio | 180–320 ms |
| Octen | 60–95 ms |
| Codex/card assembly | 400–700 ms |

They are presentation metadata, not wall-clock waits. Live and fallback attempts use measured elapsed time.

### 13.2 Client pacing

| Item | Timing |
| --- | ---: |
| Reasoning character | 32 ms |
| Pause after reasoning line | 380 ms |
| Pause after section heading | 550 ms |
| Evidence row | 90 ms |
| Semantic row | 90 ms |
| Hypothesis row | 120 ms |
| Legacy answer character | 22 ms after initial pause |
| Candidate stagger | 700 ms between cards |

On `prefers-reduced-motion`, each reasoning line appears immediately; line and section pacing remains so the trace is readable.

### 13.3 Narration source

Reasoning is templated from actual account, detector, and scoring values. It is never generated by a live model. It must use first person, short lines, concrete values, and no ornamental uncertainty.

Path A includes:

- lookup of `maria@example.com`;
- six records from three sources;
- two $84.00 charges 40 seconds apart;
- no refund against either charge;
- kettle order delivered two days ago;
- nothing overdue;
- no subscriptions;
- the exact five-word fragment;
- duplicate charge strongest;
- wrong item second;
- earlier solved contact third; and
- late delivery rejected.

Path B includes the literal-match failure, `boily thing`, kettle, `0.81`, and order `A-4471`.

Path C begins with:

```text
· no message
Nothing was typed. That's fine.
The account is enough on its own.
Reading maria@example.com.
```

## 14. Customer and judge interface

### 14.1 Header and input

- One `<h1>` reads `Wordless.`
- The tagline is `Point instead of explaining.`
- Meters show actual Unicode-aware word count and human turns.
- Maria’s identity is presented as already attached to the request.
- Empty input changes the submit label to `I need help`.

### 14.2 Comparison

The left panel renders the locked return-policy answer and explicitly labels it a confident guess that answered a question Maria did not ask.

The right panel renders exactly three action-bearing cards. Each card has:

- a real `<button>`;
- a numbered shape;
- concrete title and detail;
- explicit action label;
- visible keyboard focus; and
- a separate `details` disclosure for evidence.

The first card is visually emphasized, but all three remain independent buttons.

### 14.3 Engine panels

- Tool rail: source/state, latency, simulation marker, and connector progression.
- Reasoning: 15 px text, 1.75 line height, dim completed lines, current-line cursor, internal autoscroll.
- Evidence: source, concise line, hit/write text marker, and hover-revealed raw JSON.
- Scores: all core rules including rejected rows; Path B switches to keyword-versus-Octen columns.

Zendesk history is read during the Composio stage. The separate Zendesk rail stage remains idle until a selected action causes a write.

## 15. Presenter mode

Enable presenter mode with:

```text
/?present=1
```

The bar exposes these steps:

```text
input → Composio → Octen → scoring → cards → tap → receipt
```

Controls:

- `Space` advances one step.
- `R` resets the selected path to input.
- `1`, `2`, `3` load Paths A, B, and C.
- `Cmd/Ctrl+D` toggles requested demo/live mode.
- `Esc` resets and focuses the input.

The client buffers visual progress at stage boundaries. The server stream is allowed to continue producing events; presentation waits until the budget advances.

## 16. Modes, fallback, and offline behavior

### 16.1 Mode gates

`NEXT_PUBLIC_DEMO_MODE` chooses the browser’s initial request mode. It is not authorization.

The server permits live reads only when:

```text
requested demo mode is false
AND WORDLESS_ALLOW_LIVE_MODE=true
```

It permits live writes only when the read condition is true and:

```text
WORDLESS_ALLOW_LIVE_WRITES=true
```

### 16.2 Coherent account fallback

Composio performs Shopify, Stripe, and Zendesk reads concurrently. If any provider branch rejects, Wordless discards the partial result and uses the complete selected fixture. It never combines live orders with fixture charges or vice versa.

### 16.3 Failure matrix

| Failure | Behavior |
| --- | --- |
| Malformed resolve request | Stream Maria’s fixture using a cleaned empty fragment |
| Composio unavailable or incomplete | Emit recovered Composio event; use one complete fixture snapshot |
| Octen unavailable or malformed | Emit recovered Octen event; keep local semantic scores |
| OpenAI unavailable, times out, or violates schema | Use committed copy and mark Codex fallback |
| Zero hypotheses | Emit one `Talk to a person` candidate; write only after activation |
| Other server pipeline exception | Emit recovered error, then complete local fixture candidates |
| Browser cannot read SSE | Build complete fixture response in the client |
| Invalid or expired action token | Return a not-completed receipt |
| Live write cannot be confirmed | Return `Check before trying again` or `Nothing changed`; do not retry automatically |

Errors are written only to server or browser console paths. No error toast, raw stack, provider payload, or indefinite spinner reaches the customer surface.

### 16.4 Offline rehearsal

1. While connected, run `npm ci` and `npm run build`.
2. Run `npm run start`.
3. Open the loopback URL and confirm demo mode.
4. Disconnect WAN.
5. Reload the loopback page.
6. Run Paths A, B, and C.

Provider packages may be present in the bundle, but demo branches do not construct provider clients or make provider requests.

## 17. Action safety

Resolution is always read-only.

Every server-generated card receives a ten-minute HMAC token containing:

- version;
- request id;
- candidate id;
- fixture/request email;
- token mode; and
- expiry.

`POST /api/act`:

1. rejects cross-origin requests when an `Origin` header is present and mismatched;
2. rejects bodies over 16 KiB;
3. limits action tokens to 4,096 characters;
4. verifies signature and expiry;
5. reloads account state;
6. regenerates hypotheses;
7. finds the signed candidate id; and
8. executes only the server-owned action.

The signing fallback key is permitted only when live writes are disabled. `WORDLESS_ACTION_SIGNING_SECRET` is mandatory when live writes are enabled.

Demo actions return fictional receipts. For the primary refund path, the interface shows fictional refund `re_3PqX` and Zendesk ticket `#4471`, the evidence row is marked `WRITE`, and the Zendesk rail timing carries `sim`. No external state changes.

Live actions use an in-memory idempotency ledger for the lifetime of the process. Refund writes are never retried after an ambiguous timeout. If Stripe confirms but the Zendesk follow-up fails, the receipt preserves the confirmed refund and states that the ticket was not changed.

## 18. Provider boundaries

### 18.1 Composio

Composio is the merchant integration layer, not the customer data owner.

Read session toolkits and allowlist:

```text
Shopify
  SHOPIFY_GET_CUSTOMERS_SEARCH
  SHOPIFY_GET_CUSTOMER_ORDERS

Stripe
  STRIPE_LIST_CUSTOMERS
  STRIPE_LIST_CHARGES
  STRIPE_LIST_SUBSCRIPTIONS
  STRIPE_LIST_REFUNDS

Zendesk
  ZENDESK_SEARCH_ZENDESK_USERS
  ZENDESK_GET_USERS_REQUESTED_TICKETS
```

Write session allowlist:

```text
Stripe
  STRIPE_CREATE_REFUND

Zendesk
  ZENDESK_CREATE_ZENDESK_TICKET
  ZENDESK_UPDATE_ZENDESK_TICKET
```

The session owner is `COMPOSIO_MERCHANT_USER_ID`. Connected-account ids are fixed server configuration. The requester email is used only to query merchant records and must match exactly after normalization.

Read and write sessions are separate, connection management is disabled, sandbox is disabled, and tools are preloaded from static allowlists.

No credentialed Composio, Shopify, Stripe, or Zendesk request is claimed.

### 18.2 Octen

Octen supplies embeddings only. Wordless owns:

- hypothesis document construction;
- query/document separation;
- response validation;
- document cache;
- cosine similarity;
- recency and base weighting;
- top-three selection; and
- golden/local fallback.

No provider write is possible through the Octen adapter.

### 18.3 OpenAI

OpenAI is optional and not on the fixture critical path.

The card-copy request sends hypothesis id, title, and detail, then requests strict structured output with Zod. The prompt requires one sentence; runtime validation enforces three-to-seven-word titles, details under 20 words, stable ids, and the banned-jargon list. The current adapter uses a 900 ms request timeout and falls back without retry.

The legacy request sends the fragment and asks for a short, confident knowledge-base answer. All golden paths bypass the model and use the committed return-policy text.

The installed adapter defaults to `gpt-5.6-luna` when `OPENAI_MODEL` is absent, and `.env.example` sets that value explicitly. This is configuration present in code, not a claim that the model was successfully called with credentials.

### 18.4 Codex

Codex is a development-time provenance boundary. The committed corpus, generator, detector catalogue, pipeline, and interface were built through the Codex workflow, but no request-time Codex API call occurs.

`scripts/generate-rules.ts` is a deterministic offline validator. It reads the synthetic corpus, domain types, and detector catalogue; checks mappings and coverage; and writes provenance/report files. It does not make a network call or dynamically regenerate production rules during a support request.

The runtime rail label `Codex` represents committed rule/copy assembly. In demo mode its timing is simulated and labeled accordingly.

### 18.5 Zendesk

Zendesk is accessed only through the scoped Composio sessions.

- Read path: find the exact requester in merchant Zendesk and retrieve requested tickets.
- Write path: create a support ticket or reopen/update a selected ticket after a tap.
- Refund path: a Stripe refund may be followed by a Zendesk record update; a ticket failure never causes a second refund attempt.

No direct Zendesk SDK or credentialed account test is claimed.

## 19. Accessibility contract

Wordless uses Atkinson Hyperlegible Next via `next/font`, bundled during build.

Required behavior:

- exactly one page `<h1>`;
- `<main>` and labeled semantic sections;
- native form and button behavior;
- Enter submits and Enter/Space activate cards through native button semantics;
- visible 3 px focus outlines with offset;
- customer base font of 18 px;
- candidate buttons at least 82 px tall normally and 74 px in the compact desktop-height layout, always above the 44 px target;
- numbered shapes and text labels in addition to color;
- polite result announcements;
- focus moved to choices after resolution and receipt after action;
- evidence disclosure separated from the action button;
- judge surface excluded from the accessibility tree;
- reduced-motion treatment for animation, scrolling, card reveals, and cursors;
- desktop one-screen layout; and
- narrow-screen single-column reflow down to 320 px.

`@axe-core/react` mounts dynamically only in development. A release must review its console output in every important state: idle, streaming, cards, evidence disclosure, receipt, and presenter mode. Its inclusion is not by itself a claim of zero violations.

Keyboard acceptance:

1. Tab to the input and submit without a pointer.
2. Reach each card and its evidence disclosure.
3. Activate a card with Enter or Space.
4. Confirm focus lands on the receipt.
5. Reset with Escape.
6. Exercise presenter mode with the pointer unused.

## 20. Brand assets and licensing omissions

The tool rail uses checked-in files for Composio and the OpenAI wordmark. Those files remain subject to the trademark, brand, and redistribution terms of their owners; they are not relicensed by Wordless.

No Octen or Zendesk image logo is included. The interface intentionally shows their names as text. During this build, a clearly licensed, redistributable official asset was not established for those slots.

Rules for future additions:

1. Obtain the asset from the provider’s official brand or press source.
2. Confirm that the intended use and redistribution are permitted.
3. Record source URL, retrieval date, and applicable terms.
4. Preserve the original proportions and required clear space.
5. Never redraw, approximate, scrape, or use a third-party logo pack as a substitute.

## 21. Synthetic corpus and provenance

The repository contains 384 deterministic fictional tickets:

- 64 duplicate-charge records;
- 64 wrong-item/replacement records;
- 64 late-delivery records;
- 64 renewal records;
- 64 pending-refund records; and
- 64 clean/settled records.

Each family has 16 examples in each style:

- fragment;
- misspelling;
- circumlocution; and
- fluent.

All identities use the reserved `example.invalid` domain and are marked fictional.

Generation commands:

```bash
npm run generate:corpus
npm run generate:rules
```

The second command verifies:

- minimum corpus size;
- unique ticket ids;
- style coverage;
- expected resolution/detector/action mappings;
- `ActionSpec` literals in the domain types;
- detector literals in the committed catalogue; and
- the clean-state non-detector invariant.

It writes a deterministic report and TypeScript provenance constant containing hashes. Neither command is part of the runtime or normal build.

## 22. Environment contract

```dotenv
NEXT_PUBLIC_DEMO_MODE=true

WORDLESS_ALLOW_LIVE_MODE=false
WORDLESS_ALLOW_LIVE_WRITES=false
WORDLESS_ACTION_SIGNING_SECRET=

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna

OCTEN_API_KEY=
OCTEN_API_URL=https://api.octen.ai/embedding
OCTEN_EMBEDDING_MODEL=octen-embedding-4b
OCTEN_EMBEDDING_DIMENSION=256
OCTEN_TIMEOUT_MS=5000

COMPOSIO_API_KEY=
COMPOSIO_MERCHANT_USER_ID=
COMPOSIO_SHOPIFY_CONNECTED_ACCOUNT_ID=
COMPOSIO_STRIPE_CONNECTED_ACCOUNT_ID=
COMPOSIO_ZENDESK_CONNECTED_ACCOUNT_ID=
COMPOSIO_SESSION_TIMEOUT_MS=5000
COMPOSIO_READ_TIMEOUT_MS=5000
COMPOSIO_WRITE_TIMEOUT_MS=8000
```

Only the initial demo-mode preference is public. Every credential, account id, live gate, and signing secret remains server-side.

Before enabling live mode:

1. Use non-production merchant, payment, and ticket accounts.
2. Protect the app with access control.
3. Review the raw evidence sent to the judge surface.
4. Review the data sent to Octen and OpenAI.
5. Verify all connected-account ids belong to the configured merchant user.
6. Exercise reads before writes.
7. Perform a single controlled write and verify idempotency/failure behavior.
8. Record the result; do not infer success from adapter compilation.

## 23. Commands and runbook

Install and start development:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Start the compiled application:

```bash
npm run build
npm run start
```

Validation commands:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:html
npm test
```

`npm test` runs type checking, unit/contract tests, a production build, and rendered-HTML tests.

Release runbook:

1. Leave all live gates false.
2. Run corpus/rule generation only if their sources changed; inspect the diff.
3. Run `npm run lint`.
4. Run `npm test`.
5. Start the production build locally.
6. Exercise Paths A, B, and C with the pointer unused.
7. Confirm Path A reads `5 words, 1 turn`.
8. Confirm duplicate evidence says 40 seconds apart.
9. Confirm late delivery is rejected, not a card.
10. Open and close each evidence disclosure.
11. Activate the first card and confirm the tool rail marks the receipt path as `sim`.
12. Test `?present=1` through receipt.
13. Test 320 px and 1440×900 layouts.
14. Test reduced motion.
15. Review development axe output and browser console.
16. Disconnect WAN and repeat the local production golden paths.

Do not describe the release as credential-verified unless the controlled live procedure in §22 was actually completed and recorded.

## 24. Deployment contract

The Sites project configuration is committed with no D1 or R2 binding. The deployed artifact must preserve:

- fixture mode as the default;
- both live server gates false;
- no provider secrets in client assets;
- SSE no-cache/no-buffer headers;
- all local font and image assets; and
- complete browser fallback.

A hosted fixture demo can recover from provider absence, but it still needs a network to load initially. Do not market the remote URL as an installable offline application.

## 25. Non-goals

Wordless does not include:

- signup, login, or onboarding;
- production customer identity selection;
- a settings dashboard;
- multi-language support;
- an open-ended chat transcript;
- a database;
- a service worker;
- a live Codex request;
- automatic action selection;
- background writes;
- retry of ambiguous payment writes; or
- unlicensed logo recreation.

Future work must preserve the central boundary: account evidence may propose a meaning, but only the person can select it.

## 26. Reference documentation

- [Octen Embedding API](https://docs.octen.ai/api-reference/embedding)
- [Octen embedding capability](https://docs.octen.ai/capabilities/embedding)
- [Composio TypeScript SDK](https://docs.composio.dev/reference/sdk-reference/typescript)
- [Composio sessions](https://docs.composio.dev/reference/sdk-reference/typescript/sessions)
- [Composio session configuration](https://docs.composio.dev/docs/configuring-sessions)
- [Composio authentication](https://docs.composio.dev/docs/authentication)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
