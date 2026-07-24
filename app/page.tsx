"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActReceipt, Candidate, ResolveResponse } from "@/lib/types";
import { DEMO_CYCLE } from "@/lib/fixtures";
import { countWords } from "@/lib/format";
import { localResolve } from "@/lib/local-resolve";
import { demoReceipt } from "@/lib/receipts";
import FragmentInput from "@/components/FragmentInput";
import LegacyPanel from "@/components/LegacyPanel";
import PointPanel from "@/components/PointPanel";
import Receipt from "@/components/Receipt";
import Meters from "@/components/Meters";
import AxeAudit from "@/components/AxeAudit";

// The single demo screen. One state machine:
//   idle → revealing → settled → receipt → (Start again) → idle
//
// Staged reveal (~2.2s): 0ms submit · 0–400ms legacy types · 400ms status
// line · 900/1200/1500ms cards rise · 1700ms meters. Reduced motion skips
// everything and renders the final state immediately.
//
// Hidden controls (parachutes, invisible in normal use):
//   Cmd/Ctrl+D  toggle DEMO_MODE (corner dot when live)
//   Cmd/Ctrl+K  cycle Maria → Sam → Jo
//   Cmd/Ctrl+0  zero-word mode (submits an empty fragment)
//   Esc         reset

type Phase = "idle" | "revealing" | "settled" | "receipt";

const ENV_DEMO_DEFAULT = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

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
  const [result, setResult] = useState<ResolveResponse | null>(null);
  const [receipt, setReceipt] = useState<ActReceipt | null>(null);
  // reveal step: 0 none · 1 legacy typing · 2 status line · 3–5 cards · 6 meters
  const [step, setStep] = useState(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const email = DEMO_CYCLE[customerIdx];

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setPhase("idle");
    setDraft("");
    setSubmitted("");
    setTurns(0);
    setResult(null);
    setReceipt(null);
    setStep(0);
    inputRef.current?.focus();
  }, [clearTimers]);

  const submit = useCallback(
    async (fragment: string) => {
      clearTimers();
      setPhase("revealing");
      setReceipt(null);
      setResult(null);
      setStep(0);
      setSubmitted(fragment);
      setTurns((t) => t + 1);

      // Same-origin API first; the local fixture resolver is the parachute.
      // Either way, cards exist well inside the 3-second budget.
      let res: ResolveResponse;
      try {
        res = await fetchJson<ResolveResponse>(
          "/api/resolve",
          { fragment, email, demo: demoMode },
          2800
        );
      } catch (err) {
        console.warn("[point] resolve API unreachable, resolving locally:", err);
        res = await localResolve(fragment, email);
      }
      setResult(res);

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        setStep(6);
        setPhase("settled");
        return;
      }
      const schedule: [number, () => void][] = [
        [0, () => setStep(1)],
        [400, () => setStep(2)],
        [900, () => setStep(3)],
        [1200, () => setStep(4)],
        [1500, () => setStep(5)],
        [1700, () => setStep(6)],
        [2200, () => setPhase("settled")],
      ];
      timers.current = schedule.map(([ms, fn]) => setTimeout(fn, ms));
    },
    [clearTimers, demoMode, email]
  );

  const selectCandidate = useCallback(
    async (candidate: Candidate) => {
      if (phase === "receipt") return;
      setPhase("receipt");
      let r: ActReceipt;
      try {
        r = await fetchJson<ActReceipt>(
          "/api/act",
          { action: candidate.action, email, demo: demoMode },
          3500
        );
      } catch (err) {
        console.warn("[point] act API unreachable, demo receipt:", err);
        r = demoReceipt(candidate.action, "demo");
      }
      setReceipt(r);
    },
    [phase, email, demoMode]
  );

  // Hidden controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        reset();
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "d") {
        e.preventDefault();
        setDemoMode((m) => !m);
      } else if (key === "k") {
        e.preventDefault();
        clearTimers();
        setCustomerIdx((i) => (i + 1) % DEMO_CYCLE.length);
        setPhase("idle");
        setSubmitted("");
        setTurns(0);
        setResult(null);
        setReceipt(null);
        setStep(0);
      } else if (key === "0") {
        e.preventDefault();
        setDraft("");
        void submit("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset, submit, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const candidates = result?.candidates ?? [];
  const visibleCards = step >= 5 ? 3 : step >= 4 ? 2 : step >= 3 ? 1 : 0;
  const showReceipt = phase === "receipt" && receipt !== null;

  return (
    <main className="mx-auto flex h-screen max-w-6xl flex-col gap-6 overflow-hidden p-6">
      <AxeAudit />
      <header className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-4">
          <h1 className="text-[28px] font-bold leading-none">Point</h1>
          <p className="hidden text-[16px] text-ink-soft sm:block">
            support that reads the account, not the sentence
          </p>
        </div>
        <Meters words={countWords(submitted)} turns={turns} animate={step >= 6} />
      </header>

      <FragmentInput
        ref={inputRef}
        value={draft}
        onChange={setDraft}
        onSubmit={() => void submit(draft)}
        busy={phase === "revealing"}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 md:grid-cols-2">
        <LegacyPanel
          text={result?.legacy ?? ""}
          typing={step >= 1 && phase !== "idle"}
          showCaption={step >= 3}
        />
        {showReceipt ? (
          <section aria-labelledby="point-heading" className="flex min-h-0 flex-col gap-4">
            <h2
              id="point-heading"
              className="text-[16px] font-bold uppercase tracking-[0.08em] text-signal"
            >
              What actually happened
            </h2>
            <Receipt receipt={receipt} onReset={reset} />
          </section>
        ) : (
          <PointPanel
            candidates={candidates}
            email={result?.customer.email ?? email}
            visibleCards={visibleCards}
            showStatus={step >= 2}
            onSelect={(c) => void selectCandidate(c)}
            acting={phase === "receipt"}
          />
        )}
      </div>

      {!demoMode ? (
        <p
          className="fixed bottom-3 right-4 flex items-center gap-2 text-[16px] text-ink-soft"
          title="External calls enabled (Cmd/Ctrl+D to return to demo mode)"
        >
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal" />
          live
        </p>
      ) : null}
    </main>
  );
}
