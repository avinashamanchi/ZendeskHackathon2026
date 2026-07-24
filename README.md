# Point

**Support that reads the account, not the sentence.**

Two million Americans live with aphasia. In expressive aphasia, comprehension is
intact — the person understands everything you write — but word retrieval is
broken. Every support system on earth asks them to describe their problem first.

Point inverts it. Their description is ambiguous; their account state is not.
Point reads the merchant's own records about that customer — orders, charges,
refunds, subscriptions, prior tickets — works out what is actually likely wrong
right now, and renders it as at most three large, tappable cards in plain
language. **The user points instead of explaining.**

Full design rationale and build spec: [PROMPT.md](PROMPT.md).

## Run it

```bash
npm install
npm run dev        # opens on :3000 (any port works)
npm run check      # the falsifiable claim, executable — see below
```

No keys needed: `DEMO_MODE` defaults to true and everything runs offline on
deterministic fixtures. To go live, copy `.env.example` to `.env.local`, add
keys, and press `Cmd/Ctrl+D` in the app.

## The demo paths

| Path | Do this | What happens |
|---|---|---|
| A — golden | type `order wrong the thing help` | Left panel confidently explains the return policy. Point surfaces **You were charged twice** — a duplicate charge it was never told about. words: 4, turns: 1 |
| B — circumlocution | type `the boily thing broke` | No keyword matches any record. Embedding similarity finds the kettle order. That's not a typo — that's what anomia sounds like. |
| C — zero words | press **I need help** with the box empty | Cards appear anyway, ranked on account state and recency alone. words: 0, turns: 1 |

Hidden stage controls: `Cmd/Ctrl+D` toggle demo/live · `Cmd/Ctrl+K` cycle
customer (Maria → Sam → Jo) · `Cmd/Ctrl+0` zero-word submit · `Esc` reset.

## The falsifiable claim

A healthy account produces **zero** hypotheses; ticket-generating accounts
produce two or three. `npm run check` feeds a clean fixture through both
engines and fails if anything comes back, then asserts the golden-path
rankings, engine parity, and crash-free judge input.

## How the pieces earn their place

- **Composio** (`lib/composio.ts`) — replaces the sentence the person can't
  write: reads Stripe charges/refunds/subscriptions and Zendesk ticket history
  for the requester email already on the ticket; executes the refund/ticket
  write **only after an explicit tap**. Merchant's own records, connected once
  by the merchant — nobody's inbox is scanned.
- **Octen** (`lib/octen.ts`) — catches circumlocution. "The boily thing"
  contains no keyword; `octen-embedding-4b` cosine similarity finds the
  kettle. Offline fallback ladder: precomputed table → token overlap.
- **Codex step** (`scripts/generate-rules.ts`) — the hypothesis engine
  (`lib/hypotheses.generated.ts`) is *generated offline* from 350 resolved
  tickets (`data/ticket-corpus.json`): clustered by resolution, base scores
  measured as P(reason | account state), circumlocution variants mined from
  ticket bodies. Hand-written rules (`lib/hypotheses.ts`) are the committed
  fallback; `npm run check` asserts the two agree.
- **OpenAI** (`lib/llm.ts`) — polishes card copy under strict aphasia-copy
  rules, and simulates the legacy description-first agent: fluent, confident,
  wrong.

Every external call has a timeout and a deterministic fixture fallback. The
person never sees an error, a spinner that doesn't resolve, or an empty screen.

## Accessibility

This is an accessibility product; the bar is not negotiable. Atkinson
Hyperlegible Next (self-hosted), nothing under 16px, real `<button>`s, visible
focus rings, `aria-live` card region, full keyboard operation,
`prefers-reduced-motion` respected, and **zero axe-core violations** — the demo
passes the standard we argue is insufficient.
