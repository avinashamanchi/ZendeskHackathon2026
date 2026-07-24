"use client";

import { useEffect, useRef, useState } from "react";
import type { ReasonItem } from "@/lib/reasoning";
import { REASON } from "@/lib/timing";

// DEMO-CRITICAL — the star of the engine zone. Streams the narration
// character by character at read-aloud pace (§9.6). Completed lines dim to
// 65%; a block cursor blinks at the write position; auto-scroll keeps the
// cursor ~2 lines above the bottom edge. Reduced motion: whole lines land
// instantly but keep the line-by-line pacing.
//
// Lives inside the aria-hidden engine zone — visual only, by design (§15).

export default function ReasoningStream({
  items,
  runId,
}: {
  items: ReasonItem[];
  runId: number;
}) {
  const [idx, setIdx] = useState(0);
  const [chars, setChars] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIdx(0);
    setChars(0);
  }, [runId]);

  useEffect(() => {
    if (idx >= items.length) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const item = items[idx];
    let timer: ReturnType<typeof setTimeout>;
    if (item.kind === "head") {
      timer = setTimeout(() => {
        setIdx((i) => i + 1);
        setChars(0);
      }, REASON.HEAD_FADE_MS + REASON.HEAD_PAUSE_MS);
    } else if (reduced || chars >= item.text.length) {
      timer = setTimeout(() => {
        setIdx((i) => i + 1);
        setChars(0);
      }, REASON.LINE_PAUSE_MS);
    } else {
      timer = setTimeout(() => setChars((c) => c + 1), REASON.CHAR_MS);
    }
    return () => clearTimeout(timer);
  }, [idx, chars, items]);

  // keep the cursor in view — smooth, not jumpy
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight - box.clientHeight;
  }, [idx, chars]);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      ref={boxRef}
      className="h-full overflow-y-auto pb-[3.5em] pr-4"
      style={{ scrollBehavior: "auto" }}
    >
      <div className="max-w-[62ch] text-[15px] leading-[1.75] text-[color:var(--engine-ink)]">
        {items.slice(0, idx + 1).map((item, i) => {
          const isCurrent = i === idx;
          if (item.kind === "head") {
            return (
              <p
                key={i}
                className="head-fade mb-1 mt-4 text-[12px] uppercase tracking-[0.14em] text-[color:var(--engine-dim)] first:mt-0"
              >
                {item.text}
              </p>
            );
          }
          const text = isCurrent && !reduced ? item.text.slice(0, chars) : item.text;
          const done = !isCurrent || chars >= item.text.length;
          return (
            <p key={i} className={done && !isCurrent ? "opacity-65" : ""}>
              {text}
              {isCurrent ? (
                <span aria-hidden="true" className="reason-cursor">
                  ▋
                </span>
              ) : null}
            </p>
          );
        })}
        {idx >= items.length && items.length > 0 ? (
          <span aria-hidden="true" className="reason-cursor">
            ▋
          </span>
        ) : null}
      </div>
    </div>
  );
}
