# BUILD PROMPT — "Wordless"
Paste this entire document as your build instruction. **MUST** = hard requirement. **DEMO-CRITICAL** = appears on stage, cannot fail.
The product is called **Wordless**. Use that name everywhere — page title, header, meta tags, README.
---
## 1. The thesis — hold this the whole way through
**A person who cannot produce words needs help, and every support system on earth requires words first.**
Two million Americans live with aphasia. In expressive aphasia, comprehension and reading are intact — they understand everything you write — but they cannot retrieve the words to answer. Anomia, the failure to find a word, is near-universal.
Every AI support agent is *description-first*: customer types a fluent query → retrieval → prose answer. Given a fragment like `order... wrong... the thing... help`, these systems do not say "I don't understand." They pattern-match to the nearest article and **confidently answer the wrong question**, then close the ticket.
Wordless inverts it. Their description is ambiguous; **their account state is not.** It reads the merchant's own records about that customer, works out what is actually wrong, and renders it as large tappable cards. The user points instead of explaining.
**Scope test:** if a change doesn't make it easier for someone who cannot find a word, cut it.
---
## 2. The two-layer principle — READ BEFORE DESIGNING ANYTHING
Two audiences, opposite needs.
- **Customer surface** — radically simple. Three cards, huge type, nothing else. Complexity here contradicts the product.
- **Engine surface** — shows everything. Live reasoning, every tool call, every record, every score. This is for the judges.
**These MUST be visually separate zones.** Never put reasoning, latency, or tool logos inside the customer panel. The demo's power is the contrast: *the customer sees three cards; below is everything that had to happen.*
---
## 3. The four tools
| Tool | What it does for the person | How the judge sees it work |
|---|---|---|
| **Composio** | Replaces the sentence they can't write | Evidence streams in, record by record |
| **Octen** | Catches circumlocution — "the boily thing" | Similarity scores render live |
| **Codex** | Renders choices you can point at | Generated rules file + runtime cards |
| **Zendesk** | Where it lands; ticket history reveals what goes wrong | Ticket visibly closes |
---
## 4. Hard constraints
1. **Runs on conference wifi. MUST work with the network unplugged.** Every external call wrapped in try/catch with deterministic fixture fallback. **NEVER show an error, an unresolving spinner, or an empty screen.**
2. **Global `DEMO_MODE`** (`NEXT_PUBLIC_DEMO_MODE`, default `true`). External calls simulated with realistic latency (§10.2) so the pipeline still animates convincingly.
3. **Three golden paths pixel-perfect and identical every run** (§17).
4. **Judge-input mode never crashes.** Arbitrary input → three cards.
5. **No auth, no signup, no onboarding.**
6. **Build target 3 hours.** Follow §18.
---
## 5. Stack
- **Next.js 14+ (App Router), TypeScript, Tailwind CSS.**
- **OpenAI SDK** — card copy + legacy-agent simulation. Don't hardcode an unverified model string.
- **Composio SDK** — account reads, resolution write.
- **Octen embedding search API** — semantic fragment matching.
- **`@axe-core/react`** in dev.
- **Verify Composio and Octen SDK syntax against current docs before writing integration code.** Both are young APIs. If either exceeds 10 minutes to verify, ship simulated-mode and move on.
- Server-Sent Events for streaming pipeline + reasoning to the UI.
- No database, no state library, no component library beyond Tailwind, no animation library.
---
## 6. Project structure
```
/app
  page.tsx
  /api
    /resolve/route.ts       — SSE: pipeline events + reasoning tokens + candidates
    /act/route.ts           — executes action, returns receipt
/lib
  fixtures.ts
  hypotheses.generated.ts   — written by Codex offline (§8)
  rank.ts
  reasoning.ts              — DEMO-CRITICAL, the narration engine (§9)
  llm.ts
  composio.ts
  octen.ts
  pipeline.ts
  types.ts
/components
  FragmentInput.tsx
  LegacyPanel.tsx
  PointPanel.tsx
  CandidateCard.tsx         — DEMO-CRITICAL
  ToolRail.tsx              — DEMO-CRITICAL (§12.4)
  ReasoningStream.tsx       — DEMO-CRITICAL (§12.5) ← the star
  EvidencePanel.tsx         — (§12.6)
  ScorePanel.tsx            — (§12.7)
  ReceiptPanel.tsx          — (§12.8)
  Meters.tsx
  PresenterBar.tsx          — (§14)
/public/logos               — official brand assets
/scripts/generate-rules.ts  — run ONCE offline
/data/ticket-corpus.json
```
---
## 7. Fixtures
**`maria@example.com` — DEMO-CRITICAL golden path.** Generates exactly three hypotheses.
```ts
{
  email: "maria@example.com",
  name: "Maria O.",
  orders: [
    { id: "A-4471", placedAt: "-6d", status: "delivered", deliveredAt: "-2d",
      promisedBy: "-3d",
      items: [{ sku: "KT-118", name: "Ceramic kettle, 1.7L", qty: 1 }], total: 8400 },
    { id: "A-4390", placedAt: "-31d", status: "delivered", deliveredAt: "-27d",
      promisedBy: "-28d",
      items: [{ sku: "MG-002", name: "Stoneware mug, set of 2", qty: 1 }], total: 3200 }
  ],
  charges: [
    { id: "ch_9001", amount: 8400, createdAt: "-6d", status: "succeeded", orderId: "A-4471" },
    { id: "ch_9002", amount: 8400, createdAt: "-6d", status: "succeeded", orderId: "A-4471" },
    { id: "ch_8800", amount: 3200, createdAt: "-31d", status: "succeeded", orderId: "A-4390" }
  ],
  subscriptions: [], refunds: [],
  priorTickets: [{ id: 3312, subject: "where is my order", createdAt: "-20d", status: "solved" }]
}
```
- **`sam@example.com`** — subscription renewed 3d ago, refund initiated 9d ago unsettled.
- **`jo@example.com`** — order placed 11d ago, promised 4d ago, still `in_transit`.
Relative timestamps MUST resolve to real dates at load.
---
## 8. Hypothesis engine — generated by Codex, run OFFLINE
Hardcoded rules invite *"does this only work because you wrote five rules?"* Generating them from ticket history answers it. **20-second credibility answer, not the narrative.**
`/data/ticket-corpus.json` — 300+ synthetic resolved tickets with subject, body, resolution, account state. Generate offline. Realistic and messy.
`/scripts/generate-rules.ts` uses **Codex** to read the corpus and `types.ts`, cluster by reason for contact, and emit executable TypeScript detectors into `/lib/hypotheses.generated.ts`. **Commit the output. Never run live.**
```ts
type Hypothesis = {
  id: string; kind: string;
  title: string;        // plain language, 3-7 words, second person
  detail: string;       // one sentence, <20 words, concrete specifics
  evidence: string[];
  occurredAt: Date;
  baseScore: number;
  variants: string[];   // circumlocutions, for Octen
  action: ActionSpec;
}
export function generateHypotheses(state: AccountState): Hypothesis[]
```
**Hand-write these five as the committed fallback** so the generator can never block you:
| kind | Condition | title | base |
|---|---|---|---|
| `duplicate_charge` | 2 succeeded charges, same amount, within 60min | "You were charged twice" | 0.90 |
| `wrong_item` | delivered AND contact after delivery within 14d | "Something's wrong with what arrived" | 0.70 |
| `late_delivery` | past promisedBy AND not delivered | "Your order is late" | 0.80 |
| `unexpected_renewal` | subscription renewed within 7d | "A subscription renewed" | 0.60 |
| `refund_pending` | refund initiated >5d, unsettled | "Your refund hasn't arrived" | 0.75 |
**Critical property:** a healthy account produces **zero** hypotheses. Assert this on a clean fixture.
---
## 9. The reasoning stream — DEMO-CRITICAL, build this properly
This is what the demo is judged on. It must feel like watching a mind work.
### 9.1 How it's produced
**Templated from real pipeline events with real values substituted.** Not a live LLM call.
- Deterministic — identical every run, which matters on stage
- Works offline
- Genuinely describes what happened, because the values come from the actual data
- Zero added latency
It must *read* as though generated. Plain sentences, lowercase-natural, no markdown, no bullet points, no headers inside the stream.
### 9.2 Voice rules
- First person singular, present tense. "I'm looking up…" not "System retrieving…"
- One idea per line. Short lines.
- **Always cite the concrete value.** "Two charges of $84.00, 40 seconds apart" — never "found some charges."
- Show uncertainty honestly: "That's unusual." "Nothing is actually late." "That word carries no signal."
- Never apologise, never hedge decoratively, never use "issue" or "regarding."
- No emoji. No exclamation marks.
### 9.3 The Path A script — implement verbatim
Each line streams character by character. Values in `{braces}` are substituted from live data.
```
· reading the account
I'm looking up {email}.
Reading Stripe, orders, and past tickets at the same time.
Got {n} records from {m} sources.
· what I found
Two charges of {amount}, both on {date}, {seconds} seconds apart.
Neither has a refund against it.
Order {orderId} was delivered {n} days ago — one {itemName}.
Nothing is overdue. No subscriptions on this account.
· reading the fragment
The message is {n} words: "{fragment}".
"the thing" doesn't name anything, so I'll match it by meaning instead.
Closest match is the {itemName} from {orderId}, at {score}.
"wrong" leans toward something arriving damaged, {score}.
"help" carries no signal, {score}.
· deciding
Three states could have prompted this. Scoring each one.
Duplicate charge is strongest — it's recent, and money outranks everything.
Wrong item is close behind.
Late delivery scores low. Nothing is actually late.
· writing the choices
Three cards, plain language, every title under seven words.
```
### 9.4 The Path B script — the circumlocution moment
This is the most important 15 seconds of the demo. Give it room.
```
· reading the fragment
The message is 4 words: "the boily thing broke".
None of these words appear in any rule I have.
Keyword matching scores 0.00 against all five. It finds nothing.
Trying meaning instead.
"boily thing" is closest to {itemName} — {score}.
That's the item in order {orderId}.
"broke" points at something arriving damaged.
```
### 9.5 The Path C script — zero words
```
· no message
Nothing was typed. That's fine.
The account is enough on its own.
Reading {email}.
```
### 9.6 Timing — SLOW ENOUGH TO READ ALOUD
| Property | Value |
|---|---|
| Character stream rate | **32ms/char** |
| Pause after each line | **380ms** |
| Pause after each `·` section header | **550ms** |
| Section header stream rate | instant (fade in over 200ms) |
| Total Path A reasoning duration | **~13 seconds** |
The presenter narrates over this. It should feel unhurried. **If it finishes before you've finished talking, it's too fast — raise the per-character rate rather than adding dead pauses.**
### 9.7 Visual treatment
- Completed lines dim to 65% opacity. The current line is full opacity.
- A block cursor `▋` blinks at the write position, 530ms interval.
- Section headers `· reading the account` in `--engine-dim`, letter-spaced, smaller.
- Auto-scroll so the cursor stays ~2 lines above the bottom edge. Smooth, not jumpy.
- 15px, line-height 1.75, max-width 62ch. **Readable from across a room.**
- On `prefers-reduced-motion`: render each line instantly, keep line-by-line pacing.
---
## 10. Pipeline events
### 10.1 Contract
`/api/resolve` is an **SSE stream**.
```ts
type PipelineEvent =
  | { t: "stage_start";  tool: "composio"|"octen"|"codex"|"zendesk"; label: string }
  | { t: "stage_done";   tool: string; ms: number; summary: string }
  | { t: "reason_head";  text: string }                    // "· reading the account"
  | { t: "reason_line";  text: string }                    // one full line, client streams chars
  | { t: "evidence";     source: string; line: string; raw: object; hit: boolean }
  | { t: "hypothesis";   kind: string; base: number; recency: number;
                          semantic: number; total: number; fired: boolean; why: string }
  | { t: "semantic";     token: string; target: string; keyword: number; octen: number }
  | { t: "candidates";   cards: Card[] }
  | { t: "error";        tool: string; recovered: true }   // never surfaced to user
```
### 10.2 Simulated latency
Under `DEMO_MODE`, never resolve instantly — it looks fake.
- Composio reads: 180–320ms, three sources in parallel
- Octen embedding: 60–95ms (their real P50 is ~62ms; stay in range and honest)
- Card copy: 400–700ms
- Action execution: 500–900ms
±15% jitter so repeated runs don't look canned.
---
## 11. Octen, Composio, LLM layers
### `lib/octen.ts`
Anomia produces **circumlocution** — talking around the word. "The water hot thing" for kettle. Substring matching returns nothing. **Keyword matching fails exactly where this population is.**
`embedText(text)`, `similarity(a,b)` (cosine). At startup, embed each hypothesis `title` + `variants`, cache in memory. Variants MUST include circumlocutions: kettle → `["water thing","boily thing","the hot one","thing for tea"]`; charge → `["money","bank","card","took twice","paid two"]`.
At query time embed the fragment once, score against each cached vector, **emit a `semantic` event per comparison carrying both the keyword score and the Octen score.**
```
finalScore = baseScore + recencyBoost + (0.4 × cosine)
recencyBoost = 0.5 within 72h, 0.25 within 7d, else 0
```
Top **3** only. **Never more** — three is the design constraint, not a default.
**Fallback:** under `DEMO_MODE` or on failure, precomputed similarity for the three golden fragments plus keyword matching. **Path B MUST work offline.**
### `lib/composio.ts`
Three **read-only** reads, each emitting `stage_start` / `evidence` / `stage_done`: `getCharges`, `getOrders`, `getPriorTickets`. One **write**, only after a tap: `executeAction(spec)`.
**Non-negotiable:**
1. Reads are read-only. **The write fires ONLY after an explicit tap.** Never act on a hypothesis.
2. These are **the merchant's records about their own customer**, connected once by the merchant — not a scan of the customer's personal inbox. If any code path implies otherwise, delete it.
3. Minimum action scope. Keys server-side only.
### `lib/llm.ts`
**`generateCardCopy(hypothesis, state)`** — 4s timeout, fixture fallback.
```
You write interface copy for people with expressive aphasia. They understand
everything you write; they cannot produce words themselves. Write in plain,
concrete, second-person language.
- Title: 3-7 words, sentence case, no question marks, no jargon.
- Detail: exactly one sentence, under 20 words, containing the specific
  number, date, or item name.
- Never use: "issue", "concern", "regarding", "we apologise", "it appears".
- Never hedge. Say what happened.
- Return strict JSON {"title","detail"}. No markdown, no preamble.
```
**`legacyResponse(fragment)` — DEMO-CRITICAL.** Fluent, confident, **wrong**.
```
You are a typical AI customer support agent backed by a knowledge base. You
answer confidently from the closest-matching help article. You never say you
are unsure and never ask what the user means. Produce a short confident reply
(2-3 sentences) answering the nearest plausible topic. No clarifying questions.
```
Hard-code the golden-path fallback:
> "Happy to help with your return! You can start a return within 30 days of delivery from the Orders page. Once we receive the item, refunds are processed in 5–7 business days."
That reply is about returns. Maria's problem is a duplicate charge. **The demo is that gap.**
---
## 12. UI specification
### 12.1 Typeface
**Atkinson Hyperlegible Next** (Google Fonts) throughout — designed by the Braille Institute for letterform distinguishability. A substantive choice; say so in the pitch.
- Customer surface: body 18px min, card titles 28px/700, detail 18px/400 lh 1.6.
- Reasoning stream: 15px, lh 1.75.
- Engine data panels: 13px, `font-variant-numeric: tabular-nums` on all figures.
- No thin or light weights anywhere.
### 12.2 Palette
Never use colour alone to carry meaning — every distinction also carries shape, icon, or text.
```
--ink:        #14181F      --paper:      #FBFBF9
--ink-soft:   #4A5462      --card:       #FFFFFF
--edge:       #DDE1E6      --stale:      #6B7280
--signal:     #1B4D8F      --signal-bg:  #EAF1FA
--engine-bg:  #0E1116      --engine-ink: #C9D1D9
--engine-dim: #6E7681      --engine-hit: #58C4A0
--engine-null:#E5534B
```
Customer zone on `--paper`. Engine zone on `--engine-bg` — reads instantly as "under the hood." Legacy panel greyed; `--signal` appears **only** in the Point panel.
### 12.3 Layout
Single screen, no page scroll. The reasoning stream scrolls internally.
```
┌────────────────────────────────────────────────────────────────────────┐
│ Wordless                                          words: 4   turns: 1  │ 56
├────────────────────────────────────────────────────────────────────────┤
│  [ order wrong the thing help                                      ]   │ 88
├──────────────────────────┬─────────────────────────────────────────────┤
│ WHAT THE MACHINE HEARD   │ WHAT ACTUALLY HAPPENED                      │
│                          │ ┌─────────────────────────────────────────┐ │
│ Happy to help with your  │ │ You were charged twice                  │ │ 36%
│ return! You can start a  │ │ Two charges of $84.00 on Mar 3 · A-4471 │ │
│ return within 30 days... │ └─────────────────────────────────────────┘ │
│                          │ ┌─────────────────────────────────────────┐ │
│ ⚠ answered a question    │ │ Something's wrong with what arrived     │ │
│   the customer did not   │ └─────────────────────────────────────────┘ │
│   ask                    │ ┌─────────────────────────────────────────┐ │
│                          │ │ Your order is late                      │ │
│                          │ └─────────────────────────────────────────┘ │
├──────────────────────────┴─────────────────────────────────────────────┤
│ ⬤ composio 247ms ──→ ⬤ octen 71ms ──→ ⬤ codex 612ms ──→ ○ zendesk    │ 52
├─────────────────────────────────────┬──────────────────────────────────┤
│ · deciding                          │ EVIDENCE      7 rec · 3 src      │
│                                     │ stripe ch_9001 $84.00      ◀ hit │
│ Three states could have prompted    │ stripe ch_9002 $84.00      ◀ hit │
│ this. Scoring each one.             │ orders A-4471  delivered         │
│ Duplicate charge is strongest —     │ zendesk #3312  solved            │
│ it's recent, and money outranks     ├──────────────────────────────────┤
│ everything.▋                        │ SCORES                           │
│                                     │ duplicate_charge  .90+.50+.30 →  │
│                                     │                       1.70 FIRED │
│                                     │ wrong_item        .70+.50+.27 →  │
│                                     │                       1.47 FIRED │
│                                     │ unexpected_renewal    — not fired│
└─────────────────────────────────────┴──────────────────────────────────┘
```
Reasoning stream gets ~58% of the engine zone width. It's the star.
### 12.4 Tool rail — DEMO-CRITICAL
Full-width strip between the customer and engine zones.
- **Logos:** download official brand assets from each company's brand/press page into `/public/logos`. Render at 22px height. Do not redraw or approximate.
- **States:**
  - `idle` — greyscale, 35% opacity, hollow dot
  - `running` — full colour, filled dot, 1.2s pulse on the ring, label reads the current sub-action (`reading stripe`, `embedding fragment`)
  - `done` — full colour, latency in tabular figures
  - `skipped` — dashed border, label `fixtures`
- Connector arrows between chips fill left-to-right as each stage completes, 400ms.
- **Latency MUST be real** — measure it. Under `DEMO_MODE` show simulated timings with a small `sim` marker. **Never claim a real API call you didn't make.** If a judge asks and the number is invented, you lose the room.
Octen's chip is the one to watch — a two-digit millisecond number beside their logo is the best possible nod to their product.
### 12.5 Reasoning stream — DEMO-CRITICAL
Left panel of the engine zone. Implements §9 exactly. This is the component to get right before anything else in the engine zone.
### 12.6 Evidence panel
Top right of engine zone. Records stream in as `evidence` events arrive, ~90ms apart.
```
stripe    ch_9001   $84.00  succeeded   Mar 3, 09:14        ◀
stripe    ch_9002   $84.00  succeeded   Mar 3, 09:14        ◀
orders    A-4471    delivered Mar 7 · Ceramic kettle 1.7L
zendesk   #3312     solved · "where is my order"
```
Monospace 13px. Rows that trigger a hypothesis get a `--engine-hit` left border and a `◀` marker. Hover reveals raw JSON — proof it's real data, not a mock. Header shows `{n} records · {m} sources · {ms}ms`.
### 12.7 Score panel
Bottom right. Every hypothesis considered, **including ones that didn't fire** — showing rejected candidates is what makes it read as reasoning rather than a lookup.
```
duplicate_charge     .90 + .50 + .30 = 1.70   FIRED  ①
wrong_item           .70 + .50 + .27 = 1.47   FIRED  ②
late_delivery        .80 + .00 + .09 = 0.89   FIRED  ③
refund_pending                            —   no refunds on file
unexpected_renewal                        —   no subscriptions
```
Fired rows in `--engine-hit`, not-fired dimmed to `--engine-dim` with the reason. Scores animate 0 → final over 400ms.
**Path B swaps this panel for the keyword-vs-Octen comparison:** two columns, `keyword` showing 0.00 across all five, `octen` showing 0.81 on the kettle. Colour the zeros `--engine-null`. This is the clearest single proof Octen is doing real work.
### 12.8 Receipt
On tap, the customer panel replaces cards with:
- Large: **"Done. Refund of $84.00 sent."**
- Small: `Stripe refund re_3PqX · Zendesk ticket #4471 closed`
Simultaneously the engine zone shows the **write path**: zendesk chip activates, reasoning stream adds `Issuing the refund. Closing ticket #4471.`, an evidence row appears for the refund object with a `--signal` left border and a `WRITE` label. This is the only write in the system — make it visibly distinct.
### 12.9 Cards — DEMO-CRITICAL
- Min height 96px, full column width, min tap target 44×44px.
- 2px border, 8px radius. Hover/focus: border `--signal`, bg `--signal-bg`, 120ms.
- Focus ring 3px solid `--signal`, 2px offset. **Visible. Never `outline: none`.**
- Each card is a `<button>`. Enter and Space both activate.
- Collapsed "why this?" disclosure showing `evidence[]`.
### 12.10 Master timing — Path A, ~16 seconds
| t | event |
|---|---|
| 0.0s | submit; composio chip → running |
| 0.2s | reasoning: `· reading the account` |
| 0.6s | reasoning streams line 1 |
| 1.4s | evidence rows begin arriving |
| 2.6s | composio chip → done, latency renders |
| 2.8s | reasoning: `· what I found` |
| 5.4s | legacy panel types out the wrong answer (~22ms/char) |
| 6.0s | octen chip → running; reasoning: `· reading the fragment` |
| 6.4s | semantic bars grow as each line lands |
| 8.2s | octen chip → done |
| 8.6s | reasoning: `· deciding`; score rows animate |
| 11.0s | codex chip → running; reasoning: `· writing the choices` |
| 12.2s | card 1 fades and rises (240ms, 12px) |
| 12.9s | card 2 |
| 13.6s | card 3; codex chip → done |
| 14.2s | meters count up |
**Slow on purpose.** The presenter talks over it. Respect `prefers-reduced-motion`: skip transitions, keep line-by-line pacing.
---
## 13. Meters
Top right, 24px min, tabular figures. **words** = fragment token count. **turns** = times the human had to respond. Path A ends **4 / 1**. Path C ends **0 / 1**. Animate counting.
---
## 14. Presenter mode — DEMO-CRITICAL
Live demos fail when things move faster than you can narrate.
`?present=1` enables step-through. A thin bottom bar shows the current step. **Spacebar advances one stage.** Nothing runs until pressed.
Steps: `input → composio → octen → scoring → cards → tap → receipt`
- `R` — replay from start without reloading
- `1` `2` `3` — jump to Path A / B / C
- `Cmd/Ctrl+D` — toggle `DEMO_MODE`, corner indicator when live
- `Esc` — reset
**Build this. Twenty minutes, and it's the difference between narrating a demo and chasing one.**
---
## 15. Accessibility — non-negotiable
If the demo fails an audit, the project is dead on stage.
- **`@axe-core/react` in dev, zero violations.** Then say so: the demo passes the standard we argue is insufficient.
- Semantic HTML: one `<h1>`, real `<button>`s, `<main>`, landmarks.
- Contrast ≥4.5:1 text, ≥3:1 UI borders — **including the dark engine zone.** Verify.
- Card region `aria-live="polite"`. Status announced once, not looped.
- **The entire engine zone is `aria-hidden="true"`.** A screen-reader user must not wade through reasoning traces to reach the cards. Note this in the pitch — it shows the thinking goes past the demo surface.
- Full keyboard operation. **Test with the mouse unplugged before presenting.**
- Every distinction carries text or shape, never colour alone.
- `prefers-reduced-motion` respected throughout.
---
## 16. Failure handling
| Failure | Behaviour |
|---|---|
| OpenAI timeout | Fixture copy. Console log only. No UI change. |
| Composio unreachable | Fixtures. Chip shows `fixtures`. Reasoning says `Reading from cache.` |
| Octen unreachable | Precomputed similarity. Chip shows `fixtures`. |
| Zero hypotheses | One card: "Talk to a person" → files a ticket with the fragment attached. **Never an empty screen.** |
| Unparseable model JSON | Retry once, then fixture. |
| Action execution fails | Receipt reads "Sent to a person to finish" and files a ticket. **Never claim a refund succeeded when it didn't.** |
**No error toast, no red banner, no stack trace, ever.**
---
## 17. The three demo paths — all MUST work offline
**Path A — golden.** Maria, `order wrong the thing help`. Legacy returns the return policy. Wordless returns duplicate charge first. Tap → refund → ticket closes. **4 words, 1 turn.**
**Path B — circumlocution.** Maria, `the boily thing broke`. Keyword column 0.00 across all five; Octen 0.81 on the kettle. Precompute so it survives dead wifi. On stage: *that's not a typo — that's what anomia sounds like.*
**Path C — zero words.** Empty fragment, press "I need help." Cards appear on account state and recency alone. **0 words, 1 turn.**
Plus **judge input** — arbitrary text, three cards, always.
---
## 18. Build order
1. Fixtures + types.
2. Hand-written `hypotheses.ts`, five rules + clean-account assertion. **The product. Before any UI.**
3. Ranking with keyword fallback, tuned until Path A produces the intended order.
4. Customer surface on fixture data, no API calls. **Demoable product exists.**
5. Pipeline event emitter + SSE route.
6. **Reasoning stream (§9 + §12.5). The single highest-value component after the cards.**
7. Tool rail with logos and latency.
8. Evidence panel.
9. Score panel.
10. Legacy panel with confident-wrong generation + hardcoded fallback.
11. Tap → `/api/act` → receipt + write path.
12. **Presenter mode.**
13. Octen embeddings + Path B keyword-vs-octen comparison + precompute.
14. Composio wiring behind the flag.
15. Master timing pass — slow it down, read it aloud, adjust.
16. Path C zero-word mode.
17. axe-core to zero.
18. Offline Codex rule generation → commit `hypotheses.generated.ts`.
**At 2 hours, if you're not past step 11, stop adding and polish.**
---
## 19. Non-goals
No user accounts, settings, dashboard, multi-language, chat transcript, landing page, dark mode toggle, database, tests beyond the clean-account assertion, or onboarding.
No gradient hero, no animated background, no marketing section. One screen, one job.
---
## 20. What this is judged on
A judge types four broken words. The left panel confidently explains the return policy. The right panel surfaces a duplicate charge nobody mentioned. And underneath, they watch it think — reading the account, noticing two identical charges forty seconds apart, matching "the thing" to a kettle by meaning because the word itself carries none.
Build for that. Cut anything that doesn't serve it.
