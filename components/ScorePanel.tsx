"use client";

import { useEffect, useState } from "react";

// Every hypothesis considered, including the ones that didn't fire — showing
// rejected candidates is what makes this read as reasoning, not a lookup
// (§12.7). Path B swaps in the keyword-vs-Octen comparison: 0.00 down the
// keyword column, the kettle lighting up under octen — the clearest single
// proof Octen is doing real work.

export interface ScoreRowData {
  kind: string;
  base: number;
  recency: number;
  semantic: number;
  total: number;
  fired: boolean;
  rank?: number;
  why: string;
}

export interface SemanticRowData {
  token: string;
  target: string;
  keyword: number;
  octen: number; // −1 = not measured
}

const RANK_MARK = ["", "①", "②", "③"];

function AnimatedNumber({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 400);
      setShown(value * t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown.toFixed(decimals)}</>;
}

const f2 = (n: number) => n.toFixed(2).replace(/^0\./, ".");

export default function ScorePanel({
  mode,
  scores,
  semantics,
}: {
  mode: "scores" | "compare";
  scores: ScoreRowData[];
  semantics: SemanticRowData[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-[rgba(110,118,129,0.35)] pt-2">
      <p className="mb-1 text-[12px] uppercase tracking-[0.14em] text-[color:var(--engine-dim)]">
        {mode === "compare" ? "keyword vs octen" : "Scores"}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto font-mono text-[13px] leading-[1.8] tabular-nums">
        {mode === "compare" ? (
          <>
            <div className="flex gap-2 text-[color:var(--engine-dim)]">
              <span className="flex-1">match target</span>
              <span className="w-[70px] text-right">keyword</span>
              <span className="w-[70px] text-right">octen</span>
            </div>
            {semantics.map((s, i) => (
              <div key={i} className="row-in flex gap-2">
                <span className="flex-1 truncate text-[color:var(--engine-ink)]">{s.target}</span>
                <span className="w-[70px] text-right text-[color:var(--engine-null)]">
                  {s.keyword.toFixed(2)}
                </span>
                <span
                  className={`w-[70px] text-right ${
                    s.octen >= 0.5
                      ? "font-bold text-[color:var(--engine-hit)]"
                      : "text-[color:var(--engine-ink)]"
                  }`}
                >
                  {s.octen < 0 ? "—" : <AnimatedNumber value={s.octen} />}
                </span>
              </div>
            ))}
          </>
        ) : (
          scores.map((row) => (
            <div key={row.kind} className="row-in flex items-baseline gap-2">
              <span
                className={`w-[172px] shrink-0 truncate ${
                  row.fired ? "text-[color:var(--engine-hit)]" : "text-[color:var(--engine-dim)]"
                }`}
              >
                {row.kind}
              </span>
              {row.fired ? (
                <span className="flex-1 text-right text-[color:var(--engine-ink)]">
                  {f2(row.base)} + {f2(row.recency)} + {f2(row.semantic)} ={" "}
                  <span className="font-bold text-[color:var(--engine-hit)]">
                    <AnimatedNumber value={row.total} />
                  </span>{" "}
                  FIRED {RANK_MARK[row.rank ?? 0]}
                </span>
              ) : (
                <span className="flex-1 text-right text-[color:var(--engine-dim)]">
                  — {row.why}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
