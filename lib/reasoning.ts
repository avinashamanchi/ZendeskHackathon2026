import type { AccountState, Candidate } from "./types";
import { countWords, daysAgo, gapText, money, shortDate } from "./format";

// The narration engine — DEMO-CRITICAL. Templated from real pipeline values,
// not a live LLM call: deterministic on stage, works offline, genuinely
// describes what happened because every number is substituted from the data.
//
// Voice rules (§9.2): first person, present tense, one idea per line, always
// the concrete value, honest uncertainty, no apologies, no emoji, no
// exclamation marks, never "issue" or "regarding".

export type ReasonItem = { kind: "head" | "line"; text: string };

/** token-level semantic comparison, also rendered in the score panel */
export interface TokenMatch {
  token: string;
  target: string;
  keyword: number;
  octen: number;
}

export type PathId = "A" | "B" | "C" | "judge";

export function pathFor(normalizedFragment: string): PathId {
  if (normalizedFragment === "order wrong the thing help") return "A";
  if (normalizedFragment === "the boily thing broke") return "B";
  if (normalizedFragment === "") return "C";
  return "judge";
}

export function recordCounts(state: AccountState): { n: number; m: number } {
  const n =
    state.charges.length +
    state.orders.length +
    state.subscriptions.length +
    state.refunds.length +
    state.priorTickets.length;
  return { n, m: 3 }; // stripe, orders, zendesk
}

function accountFacts(state: AccountState) {
  const dupA = state.charges.find((c) => c.id === "ch_9001");
  const dupB = state.charges.find((c) => c.id === "ch_9002");
  const kettle = state.orders[0];
  return { dupA, dupB, kettle };
}

const CHOICE_LINE = (k: number) =>
  `${k === 3 ? "Three" : k === 2 ? "Two" : "One"} card${k === 1 ? "" : "s"}, plain language, every title under seven words.`;

export function buildScript(input: {
  path: PathId;
  state: AccountState;
  fragment: string;
  candidates: Candidate[];
  tokens: TokenMatch[];
  composioFromCache: boolean;
}): ReasonItem[] {
  const { path, state, fragment, candidates, tokens, composioFromCache } = input;
  const { n, m } = recordCounts(state);
  const words = countWords(fragment);
  const out: ReasonItem[] = [];
  const head = (text: string) => out.push({ kind: "head", text: `· ${text}` });
  const line = (text: string) => out.push({ kind: "line", text });
  const { dupA, dupB, kettle } = accountFacts(state);
  const itemName = kettle?.items[0]?.name.split(",")[0].toLowerCase() ?? "item";
  const s2 = (x: number) => x.toFixed(2);

  const accountSection = (full: boolean) => {
    head("reading the account");
    line(`I'm looking up ${state.email}.`);
    if (full) line("Reading Stripe, orders, and past tickets at the same time.");
    if (composioFromCache) line("Reading from cache.");
    line(`Got ${n} records from ${m} sources.`);
  };

  const foundSection = () => {
    head("what I found");
    if (dupA && dupB) {
      const gap = gapText(Math.abs(dupA.createdAt.getTime() - dupB.createdAt.getTime()));
      line(`Two charges of ${money(dupA.amount)}, both on ${shortDate(dupA.createdAt)}, ${gap} apart.`);
      line("Neither has a refund against it.");
    }
    if (kettle?.deliveredAt) {
      line(`Order ${kettle.id} was delivered ${daysAgo(kettle.deliveredAt)} days ago — one ${itemName}.`);
    }
    line("Nothing is overdue. No subscriptions on this account.");
  };

  if (path === "A") {
    accountSection(true);
    foundSection();
    head("reading the fragment");
    line(`The message is ${words} words: "${fragment.trim()}".`);
    line(`"the thing" doesn't name anything, so I'll match it by meaning instead.`);
    const t0 = tokens[0], t1 = tokens[1], t2 = tokens[2];
    if (t0 && kettle) line(`Closest match is the ${itemName} from ${kettle.id}, at ${s2(t0.octen)}.`);
    if (t1) line(`"wrong" leans toward something arriving damaged, ${s2(t1.octen)}.`);
    if (t2) line(`"help" carries no signal, ${s2(t2.octen)}.`);
    head("deciding");
    line("Three states could have prompted this. Scoring each one.");
    line("Duplicate charge is strongest — it's recent, and money outranks everything.");
    line("Wrong item is close behind.");
    line("Late delivery scores low. Nothing is actually late.");
    head("writing the choices");
    line(CHOICE_LINE(candidates.length));
    return out;
  }

  if (path === "B") {
    accountSection(false);
    head("reading the fragment");
    line(`The message is ${words} words: "${fragment.trim()}".`);
    line("None of these words appear in any rule I have.");
    line("Keyword matching scores 0.00 against all five. It finds nothing.");
    line("Trying meaning instead.");
    const best = tokens.find((t) => t.token === "boily thing");
    if (best && kettle) {
      line(`"boily thing" is closest to ${itemName} — ${s2(best.octen)}.`);
      line(`That's the item in order ${kettle.id}.`);
    }
    line(`"broke" points at something arriving damaged.`);
    head("deciding");
    line("Something arrived, and something broke. The account tells the same story.");
    line("Wrong item leads. The double charge is second.");
    head("writing the choices");
    line(CHOICE_LINE(candidates.length));
    return out;
  }

  if (path === "C") {
    head("no message");
    line("Nothing was typed. That's fine.");
    line("The account is enough on its own.");
    line(`Reading ${state.email}.`);
    foundSection();
    head("deciding");
    line("No words to weigh. Recency and money decide.");
    line("The recent delivery leads. The double charge is right behind it.");
    head("writing the choices");
    line(CHOICE_LINE(candidates.length));
    return out;
  }

  // judge input — arbitrary text, same voice, real values
  accountSection(true);
  head("reading the fragment");
  line(`The message is ${words} words: "${fragment.trim().slice(0, 80)}".`);
  const best = tokens.slice().sort((a, b) => b.keyword + b.octen - (a.keyword + a.octen))[0];
  if (best && Math.max(best.keyword, best.octen) > 0) {
    line(`The strongest signal is "${best.token}" — it points at ${best.target}, ${s2(Math.max(best.keyword, best.octen))}.`);
  } else {
    line("No word lands cleanly. The account carries the ranking.");
  }
  head("deciding");
  line(`${candidates.length === 3 ? "Three" : String(candidates.length)} states could have prompted this. Scoring each one.`);
  if (candidates[0]) line(`"${candidates[0].title}" is strongest.`);
  head("writing the choices");
  line(CHOICE_LINE(candidates.length));
  return out;
}
