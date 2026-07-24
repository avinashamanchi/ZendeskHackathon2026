# BUILD PROMPT — "Point" (v1, superseded)

> The shipped product is **Wordless** — the v2 build prompt (two-layer surface,
> SSE pipeline, reasoning stream, presenter mode) was applied on top of this
> spec. This file is kept as the v1 design rationale.

**Support that reads the account, not the sentence.**

This document is the single source of truth for the build. Follow it top to bottom.
Conventions: **MUST** = hard requirement, non-negotiable. **DEMO-CRITICAL** = appears on
stage in front of judges; it cannot fail, ever, under any network condition.
**CUT-LINE** = drop this first under time pressure.

---

## Part I — Why this exists

### I.1 The thesis

A person who cannot produce words needs help, and every support system on earth
requires words first.

Two million Americans live with aphasia. In expressive aphasia, comprehension and
reading are intact — the person understands everything you write — but word
*retrieval* is broken. Anomia, the failure to find a word, is near-universal across
the condition. It does not produce silence; it produces **circumlocution** — talking
around the missing word. "The boily thing" for *kettle*. "Money, took twice" for
*duplicate charge*. "Again" for *renewal*.

Every AI support agent today is **description-first**: the customer types a fluent
query, the system retrieves the nearest knowledge-base article, and returns prose.
Given `order... wrong... the thing... help`, these systems do not say "I don't
understand." They pattern-match to the closest article and confidently answer the
wrong question, then close the ticket. The person least able to push back gets the
answer least likely to be right.

**Point inverts the direction of explanation.** The user's description is ambiguous;
their account state is not. Point reads the merchant's own records about that
customer — orders, charges, refunds, subscriptions, prior tickets — computes what is
*actually likely wrong right now*, and renders it as at most three large, tappable,
plain-language cards. The user **points instead of explaining**.

### I.2 The scope test

Apply this to every decision in the build:

> If a change does not make it easier for someone who cannot find a word, cut it.

### I.3 The moment it is judged on

A judge types four broken words into a box and watches Point correctly surface a
duplicate charge it was never told about — while the legacy panel beside it
confidently explains the return policy. Build for that moment. Cut anything that
does not serve it.

---

## Part II — What gets built

### II.1 One screen, one job

A single demo screen. No auth, no signup, no onboarding, no landing page. The app
opens directly onto the demo. Top: a large fragment input and two always-visible
meters (**words**, **turns**). Below: two panels side by side —

- **WHAT THE MACHINE HEARD** (left, greyed, flat): a simulated legacy RAG agent
  answering the fragment fluently, confidently, and wrong.
- **WHAT ACTUALLY HAPPENED** (right, alive, `--signal` blue): Point's ranked
  hypothesis cards, generated from account state.

Tapping a card executes the resolution (refund / replacement / ticket) and replaces
the stack with a receipt. That is the entire product.

### II.2 The four tools, framed by the person

Each tool earns its place by what it does for the *user*. If a tool's role cannot be
phrased as a sentence about the person, it is decoration — remove it.

| Tool | What it does for the person |
|---|---|
| **Composio** | Replaces the sentence they can't write. It goes and looks — orders, charges, tickets — so they never have to explain. |
| **Octen** | Catches circumlocution. When they type "the boily thing," keyword matching returns nothing; embeddings find the kettle. |
| **Codex** (offline codegen) | Turns ticket history into the rule engine, so the choices offered are learned from what actually goes wrong — not hand-authored guesses. |
| **Zendesk** | Where the resolution lands, and where the ticket history that trains the rules comes from. |

**Both Octen and Composio MUST be genuinely wired** — real client code, real network
calls when `DEMO_MODE=false` — with deterministic fixture fallbacks layered beneath.
"Utilized" means the live code path exists, is exercised behind the flag, and the
fallback is indistinguishable on screen.

### II.3 The three demo paths — all MUST work offline

- **Path A — golden (DEMO-CRITICAL).** `maria@example.com`, fragment
  `order wrong the thing help`. Legacy panel returns the return policy. Point
  returns **You were charged twice** first. Ends at *words: 4, turns: 1*.
- **Path B — circumlocution (DEMO-CRITICAL).** Same customer, fragment
  `the boily thing broke`. No keyword in the system matches any record. Semantic
  similarity finds the kettle order; **Something's wrong with what arrived** ranks
  first. Precomputed so it works with wifi off. Stage line: *"That's not a typo —
  that's what anomia sounds like."*
- **Path C — zero words.** Empty fragment, one press of **I need help**. Cards
  appear anyway, ranked on account state and recency alone. *words: 0, turns: 1.*
  Support that works before you've said anything.
- **Judge input.** Arbitrary text MUST return three cards within 3 seconds and MUST
  never crash, error, or show an empty screen.

---

## Part III — How it gets built

### III.1 Hard constraints

1. **Offline-first.** The demo runs on conference wifi. Every external call
   (OpenAI, Composio, Octen) is wrapped in try/catch **with a timeout** and a
   deterministic fixture fallback. On failure the UI proceeds normally on fixture
   data and logs to the console only. The user MUST NEVER see an error, an
   unresolving spinner, or an empty screen.
2. **`DEMO_MODE`** — global flag, `NEXT_PUBLIC_DEMO_MODE`, default `true`. When
   true, all external calls are skipped and fixtures used directly. Hidden toggle
   (III.9) flips it live if the network cooperates.
3. **Determinism.** The three golden paths are pixel-perfect and identical every
   run. Hard-code whatever is necessary to guarantee this.
4. **No stack sprawl.** No database, no state library, no component library beyond
   Tailwind, no animation library. `useState`/`useReducer` and CSS transitions only.
5. **Keys server-side only.** All secrets live in API routes. Nothing sensitive in
   the client bundle.
6. Build target ~2.5 hours of critical path. Follow the build order in III.11;
   CUT-LINE items go first.

### III.2 Stack & structure

Next.js 14+ (App Router) · TypeScript · Tailwind CSS. OpenAI SDK for card copy and
the legacy-agent simulation (verify the model id exists before using it). Composio
SDK for account reads + the resolution write. Octen embeddings API for semantic
fragment matching. `@axe-core/react` in dev.

Verify Composio and Octen SDK syntax against current docs before writing
integration code — both are young APIs. If verification exceeds 10 minutes for
either, ship fixtures-only behind `DEMO_MODE` and move on.

```
/app
  page.tsx                  — the single demo screen
  /api/resolve/route.ts     — POST { fragment, email } → ranked candidates + legacy reply
  /api/act/route.ts         — POST { actionSpec } → executes + returns receipt
/lib
  types.ts                  — AccountState, Hypothesis, ActionSpec, Candidate, Receipt
  fixtures.ts               — three fixture customers (III.3)
  hypotheses.ts             — hand-written five rules + clean-account assertion (III.4)
  hypotheses.generated.ts   — rule engine emitted by Codex offline (III.5)
  rank.ts                   — scoring: base + recency + semantic (III.6)
  octen.ts                  — embeddings client + precomputed fallback (III.6)
  llm.ts                    — OpenAI wrappers, each with fallback (III.7)
  composio.ts               — Composio wrappers, each with fallback (III.8)
/components
  FragmentInput.tsx · LegacyPanel.tsx · PointPanel.tsx
  CandidateCard.tsx (DEMO-CRITICAL) · Receipt.tsx · Meters.tsx
/scripts
  generate-corpus.ts        — writes /data/ticket-corpus.json (offline, once)
  generate-rules.ts         — Codex step: corpus → hypotheses.generated.ts (offline, once)
/data
  ticket-corpus.json        — 300+ synthetic resolved tickets
```

### III.3 Fixtures

Three fixture customers with realistic merchant-side records. Relative timestamps
(`-6d`) MUST resolve to real dates at module load so the demo never goes stale.

**`maria@example.com` — DEMO-CRITICAL.** Must generate exactly three hypotheses:
duplicate charge (two succeeded charges of $84.00, same amount, minutes apart, on
order A-4471 — a ceramic kettle delivered 2 days ago and 1 day late), wrong/damaged
item (kettle delivered within the 14-day contact window), late delivery (delivered
after `promisedBy`). Older second order (stoneware mugs, −31d) and one solved prior
ticket for realism.

**`sam@example.com`.** Subscription renewed 3 days ago; a refund initiated 9 days
ago, still unsettled; no recent orders. → *unexpected renewal* + *refund pending*.

**`jo@example.com`.** One order placed 11 days ago, promised 4 days ago, still
`in_transit`. → *late delivery* only.

**`clean@example.com`.** A healthy account: one old delivered order, one settled
charge, nothing recent. MUST produce **zero** hypotheses (III.4).

### III.4 The hypothesis engine — the product

`generateHypotheses(state: AccountState): Hypothesis[]`

```ts
type Hypothesis = {
  id: string;
  kind: string;
  title: string;        // plain language, 3–7 words, second person
  detail: string;       // one sentence, <20 words, with a concrete number/date/name
  evidence: string[];   // raw facts, shown on request ("why this?")
  occurredAt: Date;     // when the anomaly happened — drives recency boost
  baseScore: number;    // 0–1, how strongly this state predicts contact
  variants: string[];   // circumlocution phrasings, embedded for matching
  action: ActionSpec;   // what tapping the card executes
}
```

The five detectors (hand-write these first — they are the committed fallback so the
generator can never block the build):

| kind | condition | title | detail template | base |
|---|---|---|---|---|
| `duplicate_charge` | two `succeeded` charges, same amount, ≤60 min apart | You were charged twice | Two charges of {amount} on {date} for order {orderId}. | 0.90 |
| `late_delivery` | now > promisedBy AND status ≠ delivered — OR delivered after promisedBy within 7d | Your order is late / arrived late | Order {orderId} was due {date} and is still in transit. | 0.80 |
| `refund_pending` | refund initiated >5d ago, not settled | Your refund hasn't arrived | A refund of {amount} was started {n} days ago. | 0.75 |
| `wrong_item` | order delivered, contact within 14d of delivery | Something's wrong with what arrived | Order {orderId} arrived {n} days ago with {itemName}. | 0.70 |
| `unexpected_renewal` | subscription renewed within 7d | A subscription renewed | {planName} renewed on {date} for {amount}. | 0.60 |

**Critical property — the falsifiable claim:** a healthy account produces **zero**
hypotheses; ticket-generating accounts produce two or three. Ship an executable
assertion (`npm run check`) that feeds the clean fixture through the engine and
fails the build if anything comes back. If a clean account yields hypotheses, the
rules are too loose and the thesis collapses.

`variants` MUST carry real circumlocutions per hypothesis — for the kettle:
`["water thing", "boily thing", "the hot one", "thing for tea", "broke", "arrived
broken"]`; for the charge: `["money", "bank", "card", "took twice", "paid two
times", "double"]`; for the renewal: `["again", "keeps taking", "every month"]`.
These are what make Path B work.

### III.5 The Codex step — generated rules, run OFFLINE

**Why generated:** hardcoded rules invite the objection *"does this only work
because you wrote five rules by hand?"* Generating them from ticket history is the
20-second credibility answer. It is not the narrative — do not let it eat the pitch.

1. `scripts/generate-corpus.ts` writes `/data/ticket-corpus.json`: 300+ synthetic
   resolved tickets — subject, body (realistically messy, including aphasic
   fragments), resolution, and the account state at the time.
2. `scripts/generate-rules.ts` (the Codex role) reads the corpus + the schema in
   `types.ts`, clusters tickets by reason-for-contact, and for every cluster above
   a frequency threshold **emits executable TypeScript** — a detector function over
   live account state plus its plain-language rendering — into
   `lib/hypotheses.generated.ts`, with per-cluster ticket counts and sample
   subjects in comments.
3. Run once, before the demo. **Commit the output. Never run it live.** On stage
   you open the file and say: *Codex wrote this from ticket history.*
4. The generated engine MUST satisfy the same contract and the same clean-account
   assertion as the hand-written engine. The app imports the generated engine and
   falls back to the hand-written one if it is absent.

### III.6 Semantic ranking — Octen (the most aphasia-specific component)

Keyword matching fails exactly where this population lives: no substring of "the
boily thing" appears in any record. Semantic similarity does not fail there. Treat
this component with corresponding care.

`lib/octen.ts`:
```ts
embedText(text: string): Promise<number[]>     // Octen API, timeout + fallback
similarity(a: number[], b: number[]): number   // cosine
```

- At startup, embed each hypothesis's `title + variants`, cache in memory.
- At query time, embed the fragment once; score against each cached vector.
- `finalScore = baseScore + recencyBoost + 0.4 × cosineSimilarity`
  where `recencyBoost` = 0.5 if `occurredAt` within 72h, 0.25 within 7d, else 0.
- Return the **top 3, never more** — three is a design constraint for cognitive
  load, not a default.
- **Fallback ladder:** live Octen → precomputed similarity table keyed by the
  golden-path fragments (Path B ships in this table so it works with wifi off) →
  token-overlap keyword matching for arbitrary judge input.
- Tune constants until Path A yields *duplicate charge, wrong item, late delivery*
  in that order — then **lock them**.

### III.7 LLM layer — `lib/llm.ts`

Two functions. Each MUST have a fixture fallback and a 4-second timeout.

**`generateCardCopy(hypothesis, accountState)`** — system prompt:

> You write interface copy for people with expressive aphasia. They understand
> everything you write; they cannot produce words themselves. Write in plain,
> concrete, second-person language.
> Rules: Title 3–7 words, sentence case, no question marks, no jargon. Detail is
> exactly one sentence, under 20 words, containing the specific number, date, or
> item name. Never use: "issue", "concern", "regarding", "we apologise", "it
> appears". Never hedge. Say what happened. Return strict JSON
> `{"title": string, "detail": string}` — no markdown, no preamble.

Fallback: the deterministic template copy already on the hypothesis.

**`legacyResponse(fragment)` — DEMO-CRITICAL.** Simulates a normal RAG agent:
fluent, confident, wrong. System prompt:

> You are a typical AI customer support agent backed by a knowledge base. You
> answer confidently from the closest-matching help article. You never say you are
> unsure and you never ask what the user means. Given the user's message, produce
> a short confident support reply (2–3 sentences) answering the nearest plausible
> topic. Do not ask clarifying questions.

Hard-coded golden-path fallback (so the contrast always lands):

> "Happy to help with your return! You can start a return within 30 days of
> delivery from the Orders page. Once we receive the item, refunds are processed
> in 5–7 business days."

That reply is about returns. Maria's actual problem is a duplicate charge. **The
demo is that gap.**

### III.8 Composio layer — `lib/composio.ts`

Three **read-only** reads, all with fixture fallback, all keyed by the requester
email already on the ticket:

- `getCharges(email)` → charges, refunds, subscriptions (Stripe via Composio)
- `getOrders(email)` → orders + fulfilment status (commerce tool via Composio)
- `getPriorTickets(email)` → Zendesk tickets for this requester

One **write**, fired ONLY after an explicit tap:

- `executeAction(spec)` → issues the refund / opens the replacement / files &
  closes the Zendesk ticket. Never act on a hypothesis without the tap.

Non-negotiable framing: these are **the merchant's records about their own
customer**, connected once by the merchant. This is not scanning anyone's personal
inbox. If any code path implies otherwise, delete it. Scope connections to the
minimum action set. The requester email is the one piece of information the user
never has to produce — the UI status line says so out loud (III.9).

### III.9 UI specification — the type treatment IS the argument

**Typeface.** Atkinson Hyperlegible (Next where available) — designed by the
Braille Institute for letterform distinguishability. Self-host the font files so
offline mode cannot break typography. Body ≥18px, nothing below 16px anywhere.
Card titles 28px/700. Card detail 18px/400, line-height 1.6. Prose measure ≤60ch.
No thin/light weights.

**Palette.** Never colour alone — every state distinction also carries shape,
icon, or text.

```
--ink #14181F  --ink-soft #4A5462  --paper #FBFBF9  --card #FFFFFF
--edge #DDE1E6 --signal #1B4D8F   --signal-bg #EAF1FA --stale #6B7280
```

Legacy panel lives entirely in greys; `--signal` appears only on the Point side.
Colour carries the thesis: one side of the screen is alive, the other is not.

**Layout.** Single screen, no scrolling during the demo, 16px base grid. Header:
wordmark left, meters right. Input row. Two columns: legacy left, Point right.

**Cards — DEMO-CRITICAL.** Real `<button>`s, min-height 96px, full column width,
min tap target 44×44. 2px border, 8px radius. Hover/focus: border `--signal`,
background `--signal-bg`, 120ms. Focus ring 3px solid `--signal`, 2px offset —
never `outline: none`. Enter and Space both activate. Below each card, a collapsed
**"why this?"** disclosure showing `evidence[]` — collapsed by default (no added
cognitive load) but available so a skeptical judge can audit the reasoning.

**Staged reveal.** Never render instantly. ~2.2s sequence: 0ms submit → 0–400ms
left panel types the confident wrong answer (~15ms/char) → 400ms right panel
status line **"Reading your account. You don't need to explain."** (this line is
the thesis — keep the wording) → 900/1200/1500ms cards 1–3 fade and rise
(200ms, 12px) → 1700ms meters animate. `prefers-reduced-motion`: skip every
transition, render final state immediately.

**After the tap.** Replace the stack with a receipt. Large: "Done. Refund of
$84.00 sent." Small: `Stripe refund re_… · Zendesk ticket #4471 closed`. One
**Start again** button. Copy rules throughout: active voice, sentence case, no
apologies, no "we're sorry to hear," no double-duty labels.

**Hidden controls** (invisible in normal use; your parachutes on stage):
`Cmd/Ctrl+D` toggles DEMO_MODE (tiny corner indicator when live) · `Cmd/Ctrl+K`
cycles Maria → Sam → Jo · `Cmd/Ctrl+0` zero-word mode (submits empty fragment) ·
`Esc` resets.

**Meters.** `words` (fragment token count) and `turns` (times the human had to
respond), top right, always visible, ≥24px, tabular figures, animated counting,
legible from ten feet. Path A ends *4 / 1*; Path C ends *0 / 1*.

### III.10 Accessibility — non-negotiable

This is an accessibility product; failing an audit on stage kills it.

- `@axe-core/react` in dev; reach **zero violations** — then say so on stage: the
  demo passes the standard we argue is insufficient.
- Semantic HTML: one `<h1>`, real `<button>`s, `<main>`, proper landmarks.
- Contrast ≥4.5:1 text, ≥3:1 UI borders — verify, don't assume.
- Card region `aria-live="polite"`; status line announced once, not looped.
- Full keyboard operation: Tab to input, Enter to submit, Tab through cards, Enter
  to select. Test with the mouse unplugged before presenting.
- `prefers-reduced-motion` respected throughout.

### III.11 Build order (later = CUT-LINE first)

1. Fixtures + types — nothing external.
2. Hand-written `hypotheses.ts` (five rules) + clean-account assertion. **This is
   the product — build it before any UI.**
3. Ranking with keyword fallback, tuned until Path A is in the intended order.
4. Single-screen UI on fixture data, no API calls. *You now have a demoable
   product; everything after is enhancement.*
5. `/api/resolve` with OpenAI card copy + fallback.
6. Legacy panel with confident-wrong generation + hardcoded fallback.
7. Tap → `/api/act` → receipt.
8. Octen embeddings + Path B precompute.
9. Composio wiring behind the flag.
10. Staged reveal + meters.
11. Path C zero-word mode.
12. axe-core to zero.
13. Offline Codex rule generation → commit `hypotheses.generated.ts`.
14. "Why this?" disclosure.

If you hit 2 hours and aren't at step 7, stop adding and start polishing.

### III.12 Non-goals

No user accounts, settings, dashboard, multi-language, chat transcript, landing
page, dark mode, database, onboarding, or tests beyond the assertions. No gradient
hero, no animated background, no marketing section. One screen, one job.

---

## Part IV — Acceptance checklist

Run this before calling the build done. Every box MUST check with the network off.

- [ ] `npm run check` passes: clean account → 0 hypotheses; Maria → exactly 3;
      Sam → 2; Jo → 1 (hand-written **and** generated engines).
- [ ] Path A: `order wrong the thing help` → legacy return-policy reply on the
      left; *charged twice → wrong item → late* on the right; meters 4/1.
- [ ] Path B: `the boily thing broke` → *Something's wrong with what arrived*
      first, offline, via the precomputed table.
- [ ] Path C: empty fragment + "I need help" → three cards, meters 0/1.
- [ ] Judge input: arbitrary garbage → three cards < 3s, zero crashes.
- [ ] Tap → receipt with refund id + ticket id; Start again resets.
- [ ] All four hidden controls work.
- [ ] axe: zero violations. Keyboard-only run completes Path A end to end.
- [ ] No API key appears in the client bundle.
- [ ] Live mode (`Cmd+D`, network on): Octen embeddings and Composio
      reads/write actually fire; on any failure the screen is indistinguishable
      from demo mode.
