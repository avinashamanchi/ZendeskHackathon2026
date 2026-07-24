# Wordless

Wordless is an aphasia-first support interface for people who can understand a question but cannot reliably retrieve the words needed to answer it. It reads the merchant account already attached to a support request, turns supported account states into three large choices, and lets the person select an action instead of composing a fluent explanation.

The customer sees a short input, a deliberately bad description-first chatbot answer, and three buttons. A separate judge surface shows the evidence, deterministic reasoning, similarity scores, tool states, and write receipt. That judge surface is hidden from assistive technology so it does not burden the person using the support flow.

The default configuration is a complete fixture demo. It needs no provider credentials and makes no Composio, Octen, or OpenAI call.

## Run Wordless

Requirements: Node.js 22.22.3 or newer and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For an offline stage rehearsal, install and build while connected, then run the compiled application on loopback before disconnecting the WAN:

```bash
npm ci
npm run build
npm run start
```

The offline guarantee applies to that prebuilt local server and the browser-side fixture fallback. There is no service worker, so a remote deployment cannot cold-load after the network is disconnected.

## Demo paths

The visible demo uses Maria O. and the merchant records associated with `maria@example.com`.

| Path | Input | Expected result |
| --- | --- | --- |
| A | `order wrong the thing help` | Five words and one turn. Duplicate charge first, recent delivered item second, solved earlier contact third. |
| B | `the boily thing broke` | Keyword scores are `0.00`; the offline Octen-compatible score is `0.81` for the ceramic kettle, which ranks first. |
| C | Empty input, then **I need help** | Zero words and one turn. Account evidence and recency alone produce the same three supported choices. |

Maria has exactly two orders. Two successful $84.00 charges for order `A-4471` are 40 seconds apart. The recent kettle delivery supports the `wrong_item` choice as an interpretation for Maria to confirm; the account does not independently prove damage. Solved Zendesk ticket `#3312` supplies the third customer-facing choice.

The displayed titles are **You were charged twice**, **Something's wrong with what arrived**, and **You contacted us before**.

Late delivery is intentionally not a card for Maria. The score panel still shows the rule as rejected with `nothing is past its promised date`. Semantic similarity can make a rule textually close, but it cannot manufacture an account state.

The left panel always uses the locked, confidently wrong return-policy answer for the golden paths. In fixture mode, selecting the first card produces a simulated refund and Zendesk receipt. No money moves and no external ticket changes.

## Presenter mode

Open `http://localhost:3000/?present=1` to enable the stage controller.

- `Space` advances `input → Composio → Octen → scoring → cards → tap → receipt`.
- `R` returns the current path to its input step.
- `1`, `2`, and `3` select the three paths.
- `Cmd/Ctrl+D` toggles the requested demo/live mode. Server gates still decide whether live access is allowed.
- `Esc` resets and returns focus to the input.

Without presenter mode, `1`–`3`, `Cmd/Ctrl+D`, and `Esc` remain available, except number shortcuts do not intercept typing in the input.

## Resolution stream

`POST /api/resolve` returns `text/event-stream`, not JSON. It emits:

- `stage_start` and `stage_done` with tool, source, state, measured or simulated latency, and a `simulated` flag;
- `reason_head` and `reason_line` from the deterministic narration engine;
- `evidence` records with a concise line, normalized raw object, and hit marker;
- `semantic` keyword-versus-Octen comparisons;
- `hypothesis` rows, including rules that did not fire;
- recovered `error` events without provider details; and
- one terminal `candidates` event containing signed `CandidateView` cards and the complete `ResolveResponse`.

Demo latency values are deterministic metadata within the presentation ranges. They are marked `sim` in the tool rail. The server does not sleep for the full show; the client controls the readable pacing at 32 ms per reasoning character, 380 ms between lines, and 550 ms after section headings.

If the stream fails, the browser builds the complete Maria fixture result locally. If a live account read fails, the server emits a recovered event and replaces the whole account snapshot with one coherent fixture; it never merges live and fixture customer records. Octen and OpenAI failures retain that coherent account and fall back only for scoring or copy.

## Provider boundaries

| System | Runtime responsibility | Fixture behavior | Live status |
| --- | --- | --- | --- |
| Composio | Merchant-owned Shopify, Stripe, and Zendesk reads; narrowly allowlisted writes after a tap | No SDK session is created | Adapter and mocked contract coverage are present; no credentialed account smoke test is claimed |
| Octen | Query/document embeddings; Wordless owns cosine scoring, caching, ranking, and fallback | Locked local scores, including `0.81` for “boily thing” → kettle | REST adapter and mocked response validation are present; no credentialed API smoke test is claimed |
| OpenAI | Optional constrained card copy and the non-golden legacy response | Locked local copy | Responses API adapter is present; no credentialed model smoke test is claimed |
| Codex | Offline development of the detector catalogue, corpus generator, provenance checks, and interface | No Codex call occurs during a request | The tool-rail stage represents committed rules and card assembly, not a live Codex API call |
| Zendesk | Ticket history is read through Composio; ticket creation/update happens only after explicit selection | Fictional receipt and write evidence | No direct Zendesk SDK or credentialed write verification is claimed |

Composio sessions belong to `COMPOSIO_MERCHANT_USER_ID`. The requester email is a provider query argument, never the session owner. Read and write tool allowlists are separate. A live refund is never automatically retried after an ambiguous result.

Live Octen documents contain the fragment plus hypothesis title, detail, and variants. Details can include order identifiers, dates, and amounts. Review provider data-sharing terms before enabling live mode.

## Safety model

- Resolution is read-only. A hypothesis never triggers a write.
- Every card carries a short-lived HMAC action token; the browser never submits an arbitrary provider tool or `ActionSpec`.
- `POST /api/act` verifies the token, reloads the account, regenerates the candidate, and checks both live gates before acting.
- Live reads require `WORDLESS_ALLOW_LIVE_MODE=true`.
- Live writes additionally require `WORDLESS_ALLOW_LIVE_WRITES=true` and `WORDLESS_ACTION_SIGNING_SECRET`.
- Missing credentials, malformed provider data, timeouts, and partial read failures recover to fixtures.
- A live action without confirmed completion returns a not-completed receipt; Wordless does not claim a refund succeeded.
- The current public demo has no authentication and accepts only the fixture identities. Keep live mode behind access control.

## Configuration

All provider secrets are server-only. None uses a `NEXT_PUBLIC_` prefix.

| Variable | Purpose | Default behavior |
| --- | --- | --- |
| `NEXT_PUBLIC_DEMO_MODE` | Initial browser request mode | `true` |
| `WORDLESS_ALLOW_LIVE_MODE` | Server authorization for provider reads | `false` |
| `WORDLESS_ALLOW_LIVE_WRITES` | Independent authorization for writes | `false` |
| `WORDLESS_ACTION_SIGNING_SECRET` | HMAC secret for live action tokens | Required when live writes are enabled |
| `OPENAI_API_KEY` | Optional card-copy and legacy-response client | Empty uses fixtures |
| `OPENAI_MODEL` | OpenAI model name | `.env.example` currently sets `gpt-5.6-luna` |
| `OCTEN_API_KEY` | Octen API authentication | Empty uses local scores |
| `OCTEN_API_URL` | Embedding endpoint | `https://api.octen.ai/embedding` |
| `OCTEN_EMBEDDING_MODEL` | Embedding model | `octen-embedding-4b` |
| `OCTEN_EMBEDDING_DIMENSION` | Requested vector dimension | `256` |
| `OCTEN_TIMEOUT_MS` | Octen request deadline | `5000` |
| `COMPOSIO_API_KEY` | Composio server SDK authentication | Empty uses fixtures |
| `COMPOSIO_MERCHANT_USER_ID` | Merchant/service identity that owns connections | Required for live reads |
| `COMPOSIO_SHOPIFY_CONNECTED_ACCOUNT_ID` | Shopify connection | Required for live reads |
| `COMPOSIO_STRIPE_CONNECTED_ACCOUNT_ID` | Stripe connection | Required for live reads and refunds |
| `COMPOSIO_ZENDESK_CONNECTED_ACCOUNT_ID` | Zendesk connection | Required for live reads and ticket writes |
| `COMPOSIO_SESSION_TIMEOUT_MS` | Composio session deadline | `5000` |
| `COMPOSIO_READ_TIMEOUT_MS` | Composio read deadline | `5000` |
| `COMPOSIO_WRITE_TIMEOUT_MS` | Composio write deadline | `8000` |

No provider credential is stored in this repository. The implementation has been exercised with deterministic fixtures and mocked provider contracts, not verified against live merchant, payment, ticket, embedding, or model accounts.

## Accessibility

- Atkinson Hyperlegible Next is bundled through `next/font`.
- The page has one `<h1>`, a `<main>`, labeled forms, real buttons, and visible focus rings.
- Cards use a 74–82 px minimum height depending on desktop viewport height, well above the 44 px target, with text action labels, numbered shapes, and optional evidence disclosures.
- Results use `aria-live="polite"`; focus moves to the choices and receipt after each transition.
- The judge surface is `aria-hidden="true"` so screen-reader users do not traverse tool traces or raw evidence.
- `prefers-reduced-motion` removes animated transitions and renders reasoning lines immediately while retaining line pacing.
- `@axe-core/react` mounts only in development. Treat a clean browser audit as a release check, not as proof that every support system is accessible.
- Desktop uses a one-screen layout; narrow screens reflow into a scrollable single column down to 320 px.

## Brand assets and licensing

The repository currently bundles Composio and OpenAI wordmark files under `public/logos`. They remain subject to their respective owners’ brand and redistribution terms; they are not relicensed as project artwork.

No Octen or Zendesk image logo is bundled. Their names intentionally render as text because a clearly licensed, redistributable official asset was not established during this build. Do not redraw, scrape, or substitute an unofficial logo. Add one only from an official brand source under terms that permit this use, and record its provenance.

## Corpus and offline provenance

`data/ticket-corpus.json` contains 384 deterministic, explicitly fictional records: 64 each for duplicate charge, wrong item, late delivery, unexpected renewal, pending refund, and clean state. Each family contains fragments, misspellings, circumlocution, and fluent requests.

```bash
npm run generate:corpus
npm run generate:rules
```

The scripts are deterministic and offline. They validate the corpus against the account/action types and committed detector catalogue, then write the provenance report. They never run during development, build, or a customer request.

## Commands

```bash
npm run dev              # local development server
npm run typecheck        # TypeScript without emitting files
npm run lint             # ESLint
npm run test:unit        # domain, corpus, and integration-contract tests
npm run test:html        # production build plus rendered-HTML tests
npm test                 # typecheck, unit tests, build, rendered HTML
npm run build            # production vinext/Cloudflare build
npm run start            # serve the compiled build locally
npm run generate:corpus  # regenerate deterministic fictional records
npm run generate:rules   # validate rules and rewrite provenance outputs
```

Run the full release check in the target environment:

```bash
npm run lint
npm test
```

## Important files

- `components/WordlessDemo.tsx` — client stream parser, visual pacing, presenter mode, actions, and client fallback
- `lib/pipeline.ts` — server event orchestration and terminal signed cards
- `lib/reasoning.ts` — deterministic, data-derived narration
- `lib/hypotheses.generated.ts` — committed runtime detectors
- `lib/rank.ts` — local/Octen scoring and top-three ranking
- `lib/composio.ts` — Composio sessions, normalization, and allowlisted writes
- `lib/octen.ts` — Octen REST contract, vector validation, and cache
- `lib/llm.ts` — optional OpenAI copy with strict fallback
- `lib/action-token.ts` — short-lived HMAC intents
- `docs/BUILD_SPEC.md` — authoritative implementation and acceptance contract
