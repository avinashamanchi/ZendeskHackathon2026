"use client";

// §14 — presenter mode. A thin bottom bar; spacebar advances one stage.
// Twenty minutes of code, and it's the difference between narrating a demo
// and chasing one. Visual chrome only — hidden from assistive tech along
// with the rest of the presenter machinery.

export const PRESENT_STEPS = [
  "input",
  "composio",
  "octen",
  "scoring",
  "cards",
  "tap",
  "receipt",
] as const;

export default function PresenterBar({ stepIdx }: { stepIdx: number }) {
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-between gap-4 border-t border-[rgba(110,118,129,0.35)] bg-[color:var(--engine-bg)] px-6 py-1.5 text-[13px]"
    >
      <div className="flex items-center gap-2">
        {PRESENT_STEPS.map((s, i) => (
          <span
            key={s}
            className={
              i === stepIdx
                ? "rounded bg-[rgba(88,196,160,0.16)] px-2 py-0.5 font-bold text-[color:var(--engine-hit)]"
                : i < stepIdx
                  ? "px-1 text-[color:var(--engine-ink)]"
                  : "px-1 text-[color:var(--engine-dim)]"
            }
          >
            {s}
          </span>
        ))}
      </div>
      <p className="shrink-0 text-[color:var(--engine-dim)]">
        space = next · R = replay · 1/2/3 = path · Esc = reset
      </p>
    </div>
  );
}
