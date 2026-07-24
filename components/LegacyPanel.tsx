"use client";

import { useEffect, useRef, useState } from "react";

// "What the machine heard" — the simulated description-first agent. Fluent,
// confident, wrong. This panel lives entirely in greys: it is not alive.
//
// The typewriter is visual only (aria-hidden); screen readers get the full
// reply once, in a visually-hidden node, so the animation never spams them.

export default function LegacyPanel({
  text,
  typing,
  showCaption,
}: {
  text: string;
  typing: boolean;
  showCaption: boolean;
}) {
  const [chars, setChars] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    setChars(0);
    if (!text) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!typing || reduced) {
      setChars(text.length);
      return;
    }
    timer.current = setInterval(() => {
      setChars((c) => {
        if (c >= text.length) {
          clearInterval(timer.current);
          return c;
        }
        return c + 1;
      });
    }, 22); // §12.10: ~22ms/char
    return () => clearInterval(timer.current);
  }, [text, typing]);

  return (
    <section
      aria-labelledby="legacy-heading"
      className="flex min-h-0 flex-col gap-4 border-r border-edge pr-6"
    >
      <h2
        id="legacy-heading"
        className="text-[16px] font-bold uppercase tracking-[0.08em] text-ink-soft"
      >
        What the machine heard
      </h2>
      {text ? (
        <>
          <div className="rounded-lg border-2 border-edge bg-white/40 p-5">
            <p aria-hidden="true" className="max-w-[60ch] text-[18px] leading-[1.6] text-stale">
              {text.slice(0, chars)}
              {chars < text.length ? <span aria-hidden="true">▍</span> : null}
            </p>
            <p className="visually-hidden">{text}</p>
          </div>
          {showCaption ? (
            <p className="flex max-w-[60ch] items-start gap-2 text-[16px] leading-[1.6] text-ink-soft">
              <span aria-hidden="true">⚠</span>
              <span>answered a question the customer did not ask</span>
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-[16px] text-stale">Waiting for words it can match.</p>
      )}
    </section>
  );
}
