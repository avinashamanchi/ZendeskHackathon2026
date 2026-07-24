"use client";

import { useEffect, useRef } from "react";
import type { ActReceipt } from "@/lib/types";

// The resolution, stated plainly. Active voice, no apologies, no hedging.
// Announcement comes from the page's persistent aria-live region; focus
// lands on "Start again" so a keyboard-only run never strands.

export default function ReceiptPanel({
  receipt,
  onReset,
}: {
  receipt: ActReceipt;
  onReset: () => void;
}) {
  const resetRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    resetRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col items-start gap-4 pt-2">
      <p className="flex items-start gap-3 text-[32px] font-bold leading-tight text-ink">
        <span
          aria-hidden="true"
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal text-[20px] text-white"
        >
          ✓
        </span>
        {receipt.headline}
      </p>
      <p className="text-[16px] tabular-nums text-ink-soft">{receipt.detail}</p>
      <button
        ref={resetRef}
        type="button"
        onClick={onReset}
        className="mt-2 min-h-[56px] rounded-lg bg-signal px-7 text-[22px] font-bold text-white transition-colors duration-[120ms] hover:bg-[#163f75]"
      >
        Start again
      </button>
    </div>
  );
}
