"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActReceipt,
  Candidate,
  Gate,
  TimedEvent,
  ToolName,
} from "@/lib/types";
import { DEMO_CYCLE } from "@/lib/fixtures";
import { countWords, money } from "@/lib/format";
import { localPipelineEvents } from "@/lib/local-resolve";
import { demoReceipt, ticketNumber } from "@/lib/receipts";
import type { ReasonItem } from "@/lib/reasoning";
import { CARDS, PRESENT_STEP_MS } from "@/lib/timing";
import FragmentInput from "@/components/FragmentInput";
import LegacyPanel from "@/components/LegacyPanel";
import PointPanel from "@/components/PointPanel";
import ReceiptPanel from "@/components/ReceiptPanel";
import Meters from "@/components/Meters";
import ToolRail, { type ChipState } from "@/components/ToolRail";
import ReasoningStream from "@/components/ReasoningStream";
import EvidencePanel, { type EvidenceRowData } from "@/components/EvidencePanel";
import ScorePanel, { type ScoreRowData, type SemanticRowData } from "@/components/ScorePanel";
import PresenterBar, { PRESENT_STEPS } from "@/components/PresenterBar";
import AxeAudit from "@/components/AxeAudit";

// Wordless — one screen, two layers.
// Customer surface: three cards, huge type, nothing else.
// Engine surface (dark, aria-hidden): everything that had to happen —
// the tool rail, the reasoning stream, every record, every score.
//
// /api/resolve streams TimedEvents; this file is the scheduler. Auto mode
// dispatches by each event's `at`; presenter mode (?present=1) holds them
// and releases one gate per spacebar (§14).
//
// Hidden controls: Cmd/Ctrl+D demo/live · Cmd/Ctrl+K cycle customer ·
// Cmd/Ctrl+0 zero-word submit · Esc reset · presenter adds space/R/1/2/3.

type Phase = "idle" | "running" | "settled" | "receipt";

const ENV_DEMO_DEFAULT = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

const IDLE_CHIPS: Record<ToolName, ChipState> = {
  composio: { status: "idle" },
  octen: { status: "idle" },
  codex: { status: "idle" },
  zendesk: { status: "idle" },
};

const PATH_FRAGMENTS: Record<string, string> = {
  "1": "order wrong the thing help",
  "2": "the boily thing broke",
  "3": "",
};

async function fetchEventStream(
  body: unknown,
  timeoutMs: number
): Promise<TimedEvent[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const out: TimedEvent[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const json = JSON.parse(line.slice(5).trim());
        if (json.t === "end") return out;
        out.push(json as TimedEvent);
      }
    }
    if (out.length === 0) throw new Error("empty stream");
    return out;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [demoMode, setDemoMode] = useState(ENV_DEMO_DEFAULT);
  const [customerIdx, setCustomerIdx] = useState(0);
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [turns, setTurns] = useState(0);
  const [runId, setRunId] = useState(0);

  // engine-surface slices
  const [chips, setChips] = useState<Record<ToolName, ChipState>>(IDLE_CHIPS);
  const [reasonItems, setReasonItems] = useState<ReasonItem[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRowData[]>([]);
  const [scores, setScores] = useState<ScoreRowData[]>([]);
  const [semantics, setSemantics] = useState<SemanticRowData[]>([]);
  const [evidenceMs, setEvidenceMs] = useState<number | null>(null);

  // customer-surface slices
  const [legacy, setLegacy] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [panelMode, setPanelMode] = useState<"scores" | "compare">("scores");
  const [customerEmail, setCustomerEmail] = useState(DEMO_CYCLE[0]);
  const [visibleCards, setVisibleCards] = useState(0);
  const [metersOn, setMetersOn] = useState(false);
  const [receipt, setReceipt] = useState<ActReceipt | null>(null);

  // presenter mode
  const [present, setPresent] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const generation = useRef(0);
  const eventsRef = useRef<TimedEvent[]>([]);
  const dispatchedGates = useRef<Set<Gate>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const email = DEMO_CYCLE[customerIdx];

  useEffect(() => {
    setPresent(new URLSearchParams(window.location.search).get("present") === "1");
  }, []);

  const clearTimers = useCallback(() => {
    generation.current++;
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const dispatch = useCallback(
    (e: TimedEvent) => {
      switch (e.t) {
        case "stage_start":
          setChips((c) => ({ ...c, [e.tool]: { status: "running", label: e.label } }));
          break;
        case "stage_done":
          setChips((c) => ({
            ...c,
            [e.tool]: { status: "done", ms: e.ms, sim: e.sim },
          }));
          if (e.tool === "composio") setEvidenceMs(e.ms);
          break;
        case "stage_skipped":
          setChips((c) => ({ ...c, [e.tool]: { status: "skipped", label: e.label } }));
          break;
        case "reason_head":
        case "reason_line":
          setReasonItems((r) => [
            ...r,
            { kind: e.t === "reason_head" ? "head" : "line", text: e.text },
          ]);
          break;
        case "evidence":
          setEvidence((rows) => [
            ...rows,
            { source: e.source, line: e.line, raw: e.raw, hit: e.hit },
          ]);
          break;
        case "hypothesis":
          setScores((rows) => [
            ...rows.filter((r) => r.kind !== e.kind),
            {
              kind: e.kind,
              base: e.base,
              recency: e.recency,
              semantic: e.semantic,
              total: e.total,
              fired: e.fired,
              rank: e.rank,
              why: e.why,
            },
          ]);
          break;
        case "semantic":
          setSemantics((rows) => [
            ...rows,
            { token: e.token, target: e.target, keyword: e.keyword, octen: e.octen },
          ]);
          break;
        case "legacy":
          setLegacy(e.text);
          break;
        case "candidates": {
          setCandidates(e.cards);
          setPanelMode(e.panel);
          setCustomerEmail(e.customer.email);
          const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (reduced) {
            setVisibleCards(e.cards.length);
            setMetersOn(true);
            setPhase("settled");
          } else {
            e.cards.forEach((_, i) =>
              later(i * CARDS.STAGGER_MS, () => setVisibleCards((v) => Math.max(v, i + 1)))
            );
            later(CARDS.METERS_AFTER_MS, () => setMetersOn(true));
            later(CARDS.METERS_AFTER_MS + 600, () =>
              setPhase((p) => (p === "running" ? "settled" : p))
            );
          }
          break;
        }
        case "error":
          console.warn("[wordless] recovered tool error:", e.tool);
          break;
      }
    },
    [later]
  );

  const releaseGate = useCallback(
    (gate: Gate, spread: boolean) => {
      if (dispatchedGates.current.has(gate)) return;
      dispatchedGates.current.add(gate);
      const batch = eventsRef.current.filter((e) => e.gate === gate);
      if (batch.length === 0) return;
      const t0 = Math.min(...batch.map((e) => e.at));
      batch.forEach((e, i) =>
        later(spread ? Math.min(e.at - t0, i * PRESENT_STEP_MS + 800) : e.at - t0, () =>
          dispatch(e)
        )
      );
    },
    [dispatch, later]
  );

  const resetSurfaces = useCallback(() => {
    setChips(IDLE_CHIPS);
    setReasonItems([]);
    setEvidence([]);
    setScores([]);
    setSemantics([]);
    setEvidenceMs(null);
    setLegacy("");
    setCandidates([]);
    setVisibleCards(0);
    setMetersOn(false);
    setReceipt(null);
    dispatchedGates.current = new Set();
    eventsRef.current = [];
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    resetSurfaces();
    setPhase("idle");
    setDraft("");
    setSubmitted("");
    setTurns(0);
    setStepIdx(0);
    setRunId((r) => r + 1);
    inputRef.current?.focus();
  }, [clearTimers, resetSurfaces]);

  const submit = useCallback(
    async (fragment: string) => {
      clearTimers();
      const gen = generation.current;
      resetSurfaces();
      setPhase("running");
      setSubmitted(fragment);
      setTurns((t) => t + 1);
      setRunId((r) => r + 1);
      setStepIdx(present ? 0 : 1);
      if (present) inputRef.current?.blur();

      let events: TimedEvent[];
      try {
        events = await fetchEventStream({ fragment, email, demo: demoMode }, 2800);
      } catch (err) {
        console.warn("[wordless] resolve stream unreachable, local pipeline:", err);
        events = await localPipelineEvents(fragment, email);
      }
      if (gen !== generation.current) return; // reset/cycle mid-flight
      eventsRef.current = events;

      if (!present) {
        // auto mode: dispatch on each event's own clock
        for (const e of events) later(e.at, () => dispatch(e));
      }
      // presenter mode holds everything until spacebar (§14)
    },
    [clearTimers, resetSurfaces, present, email, demoMode, dispatch, later]
  );

  const selectCandidate = useCallback(
    async (candidate: Candidate) => {
      if (phase === "receipt") return;
      clearTimers();
      const gen = generation.current;
      // freeze the reveal fully-settled before the write path starts
      setVisibleCards(candidates.length || 1);
      setMetersOn(true);
      setPhase("receipt");
      setStepIdx(6);

      const isRefund =
        candidate.action.kind === "refund_duplicate" ||
        candidate.action.kind === "refund_renewal";
      const tn = ticketNumber(candidate.action);
      setChips((c) => ({
        ...c,
        zendesk: { status: "running", label: isRefund ? "issuing refund" : "filing ticket" },
      }));
      setReasonItems((r) => [
        ...r,
        { kind: "head", text: "· acting" },
        {
          kind: "line",
          text: isRefund
            ? `Issuing the refund. Closing ticket #${tn}.`
            : `Filing ticket #${tn} with the account attached.`,
        },
      ]);

      const t0 = performance.now();
      let r: ActReceipt;
      try {
        r = await fetchJson<ActReceipt>(
          "/api/act",
          { action: candidate.action, email, demo: demoMode },
          3500
        );
      } catch (err) {
        console.warn("[wordless] act API unreachable, demo receipt:", err);
        r = demoReceipt(candidate.action, "demo");
      }
      const ms = Math.round(performance.now() - t0);
      if (gen !== generation.current) return;

      setReceipt(r);
      setChips((c) => ({
        ...c,
        zendesk: { status: "done", ms, sim: r.mode !== "live" },
      }));
      const closed = r.detail.includes("closed");
      setEvidence((rows) => [
        ...rows,
        ...(r.refundId
          ? [
              {
                source: "stripe",
                line: `${r.refundId}  ${money(candidate.action.amount ?? 0)}  refund created`,
                raw: { refundId: r.refundId, ticketId: r.ticketId, mode: r.mode },
                hit: true,
                write: true,
              },
            ]
          : []),
        {
          source: "zendesk",
          line: `#${r.ticketId ?? tn}  ${closed ? "closed" : "open"} · via Wordless`,
          raw: { ticketId: r.ticketId, headline: r.headline, mode: r.mode },
          hit: true,
          write: true,
        },
      ]);
      setReasonItems((items) => [
        ...items,
        {
          kind: "line",
          text: r.refundId
            ? `Refund ${r.refundId} created. Ticket #${r.ticketId} ${closed ? "closed" : "open"}.`
            : `Ticket #${r.ticketId ?? tn} ${closed ? "closed" : "open"}.`,
        },
      ]);
    },
    [phase, candidates.length, clearTimers, email, demoMode]
  );

  // presenter: spacebar walks the gates
  const advance = useCallback(() => {
    if (!present || phase === "idle") return;
    const next = Math.min(stepIdx + 1, PRESENT_STEPS.length - 1);
    const step = PRESENT_STEPS[next];
    setStepIdx(next);
    if (step === "composio" || step === "octen" || step === "scoring" || step === "cards") {
      releaseGate(step, true);
      if (step === "octen") releaseGate("octen", true);
    } else if (step === "tap") {
      if (candidates[0]) void selectCandidate(candidates[0]);
    }
  }, [present, phase, stepIdx, releaseGate, candidates, selectCandidate]);

  // hidden + presenter controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        reset();
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === "d") {
          e.preventDefault();
          setDemoMode((m) => !m);
        } else if (key === "k") {
          e.preventDefault();
          clearTimers();
          resetSurfaces();
          setCustomerIdx((i) => (i + 1) % DEMO_CYCLE.length);
          setPhase("idle");
          setSubmitted("");
          setTurns(0);
          setStepIdx(0);
          setRunId((r) => r + 1);
        } else if (key === "0") {
          e.preventDefault();
          setDraft("");
          void submit("");
        }
        return;
      }
      // presenter keys only when the input isn't being typed in
      const typing = document.activeElement === inputRef.current;
      if (!present || typing) return;
      if (e.key === " ") {
        e.preventDefault();
        advance();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        void submit(submitted);
      } else if (PATH_FRAGMENTS[e.key] !== undefined) {
        e.preventDefault();
        setDraft(PATH_FRAGMENTS[e.key]);
        void submit(PATH_FRAGMENTS[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset, clearTimers, resetSurfaces, submit, advance, present, submitted]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const showReceipt = phase === "receipt" && receipt !== null;

  return (
    <main className="flex min-h-screen flex-col md:h-screen md:overflow-hidden">
      <AxeAudit />
      {/* ---- customer surface: radically simple ---- */}
      <div className="bg-paper">
        <div className="mx-auto w-full max-w-6xl px-6">
          <header className="flex h-12 items-center justify-between">
            <div className="flex items-baseline gap-4">
              <h1 className="text-[26px] font-bold leading-none">Wordless</h1>
              <p className="hidden text-[16px] text-ink-soft sm:block">
                support that reads the account, not the sentence
              </p>
            </div>
            <Meters words={countWords(submitted)} turns={turns} animate={metersOn} />
          </header>
          <div className="py-2">
            <FragmentInput
              ref={inputRef}
              value={draft}
              onChange={setDraft}
              onSubmit={() => void submit(draft)}
              busy={phase === "running" && !present}
            />
          </div>
          <div className="grid min-h-[268px] grid-cols-1 gap-6 pb-3 pt-2 md:grid-cols-2">
            <LegacyPanel
              text={legacy}
              typing={phase !== "idle"}
              showCaption={visibleCards > 0}
            />
            <section aria-labelledby="point-heading" className="flex min-h-0 flex-col gap-3">
              <h2
                id="point-heading"
                className="text-[16px] font-bold uppercase tracking-[0.08em] text-signal"
              >
                What actually happened
              </h2>
              <div aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3">
                {showReceipt ? (
                  <ReceiptPanel receipt={receipt} onReset={reset} />
                ) : (
                  <PointPanel
                    candidates={candidates}
                    email={customerEmail}
                    visibleCards={visibleCards}
                    showStatus={phase !== "idle"}
                    onSelect={(c) => void selectCandidate(c)}
                    acting={phase === "receipt"}
                  />
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ---- engine surface: everything that had to happen ---- */}
      <div
        aria-hidden="true"
        className="flex min-h-[300px] flex-1 flex-col border-t border-edge bg-[color:var(--engine-bg)] md:min-h-0"
      >
        <ToolRail chips={chips} />
        <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 grid-cols-1 gap-6 px-6 pb-3 pt-1 md:grid-cols-[58%_1fr]">
          <ReasoningStream items={reasonItems} runId={runId} />
          <div className="flex min-h-0 flex-col gap-2">
            <EvidencePanel rows={evidence} ms={evidenceMs} />
            <ScorePanel mode={panelMode} scores={scores} semantics={semantics} />
          </div>
        </div>
        {present ? <PresenterBar stepIdx={stepIdx} /> : null}
      </div>

      {!demoMode ? (
        <p
          className="fixed bottom-3 right-4 flex items-center gap-2 text-[16px] text-white"
          title="External calls enabled (Cmd/Ctrl+D to return to demo mode)"
        >
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[color:var(--engine-hit)]" />
          live
        </p>
      ) : null}
    </main>
  );
}
