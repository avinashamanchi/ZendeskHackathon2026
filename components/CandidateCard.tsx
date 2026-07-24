"use client";

import type { Candidate } from "@/lib/types";

// DEMO-CRITICAL. A real <button>, minimum 96px tall, full column width.
// Nothing in this file is domain-specific — every word arrives as props,
// generated per-request from live account state. That is what separates
// Point from an admin-authored decision tree.

export default function CandidateCard({
  candidate,
  onSelect,
  shown,
  disabled,
}: {
  candidate: Candidate;
  onSelect: (candidate: Candidate) => void;
  shown: boolean;
  disabled: boolean;
}) {
  return (
    <div className={`card-reveal ${shown ? "is-shown" : ""}`}>
      <button
        type="button"
        disabled={disabled || !shown}
        onClick={() => onSelect(candidate)}
        className="min-h-[96px] w-full rounded-lg border-2 border-[color:var(--edge-strong)] bg-card p-5 text-left transition-colors duration-[120ms] hover:border-signal hover:bg-signal-bg focus-visible:border-signal focus-visible:bg-signal-bg"
      >
        <span className="block text-[28px] font-bold leading-tight text-ink">
          {candidate.title}
        </span>
        <span className="mt-2 block max-w-[60ch] text-[18px] leading-[1.6] text-ink-soft">
          {candidate.detail}
        </span>
      </button>
      <details className="mt-1 px-2">
        <summary className="flex min-h-[44px] w-fit cursor-pointer list-none items-center gap-1 rounded px-2 text-[16px] text-ink-soft [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="text-[12px]">
            ▸
          </span>
          why this?
        </summary>
        <ul className="mb-2 ml-6 list-disc space-y-1 text-[16px] leading-[1.6] text-ink-soft">
          {candidate.evidence.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
