"use client";

import { useEffect, useRef, useState } from "react";

// words = content words in the fragment (articles cost nothing to retrieve,
// so they don't count against the person). turns = times the human had to
// respond. Legible from ten feet: ≥24px, tabular figures.

function useCountUp(target: number, animate: boolean): number {
  const [value, setValue] = useState(0);
  const raf = useRef<number>();
  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || reduced || target === 0) {
      setValue(target);
      return;
    }
    const startedAt = performance.now();
    const duration = 400;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      setValue(Math.round(t * target));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, animate]);
  return value;
}

export default function Meters({
  words,
  turns,
  animate,
}: {
  words: number;
  turns: number;
  animate: boolean;
}) {
  const shownWords = useCountUp(words, animate);
  const shownTurns = useCountUp(turns, animate);
  return (
    <dl className="flex items-baseline gap-6" aria-label="Effort meters">
      <div className="flex items-baseline gap-2">
        <dt className="text-[18px] text-ink-soft">words</dt>
        <dd className="text-[28px] font-bold tabular-nums leading-none">{shownWords}</dd>
      </div>
      <div className="flex items-baseline gap-2">
        <dt className="text-[18px] text-ink-soft">turns</dt>
        <dd className="text-[28px] font-bold tabular-nums leading-none">{shownTurns}</dd>
      </div>
    </dl>
  );
}
