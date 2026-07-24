"use client";

import type { Candidate } from "@/lib/types";
import CandidateCard from "./CandidateCard";

// "What actually happened" — the live side. --signal appears only here.
// The status line IS the thesis; the wording is locked:
// "Reading your account. You don't need to explain."

export default function PointPanel({
  candidates,
  email,
  visibleCards,
  showStatus,
  onSelect,
  acting,
}: {
  candidates: Candidate[];
  email: string;
  visibleCards: number;
  showStatus: boolean;
  onSelect: (candidate: Candidate) => void;
  acting: boolean;
}) {
  return (
    <section aria-labelledby="point-heading" className="flex min-h-0 flex-col gap-4">
      <h2
        id="point-heading"
        className="text-[16px] font-bold uppercase tracking-[0.08em] text-signal"
      >
        What actually happened
      </h2>
      <div aria-live="polite" className="flex min-h-0 flex-col gap-4">
        {showStatus ? (
          <div>
            <p className="text-[18px] leading-[1.6] text-ink">
              Reading your account. You don&rsquo;t need to explain.
            </p>
            <p className="text-[16px] text-ink-soft">From your ticket: {email}</p>
          </div>
        ) : (
          <p className="text-[16px] text-ink-soft">
            Point reads the account, not the sentence.
          </p>
        )}
        <ul role="list" className="flex flex-col gap-4 overflow-y-auto">
          {candidates.map((candidate, i) => (
            <li key={candidate.id}>
              <CandidateCard
                candidate={candidate}
                onSelect={onSelect}
                shown={i < visibleCards}
                disabled={acting}
              />
            </li>
          ))}
        </ul>
        {showStatus && visibleCards >= candidates.length && candidates.length > 0 ? (
          <p className="visually-hidden">
            {candidates.length} likely matches found. Tap the one that fits.
          </p>
        ) : null}
      </div>
    </section>
  );
}
