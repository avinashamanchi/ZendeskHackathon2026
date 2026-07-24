"use client";

import { forwardRef } from "react";

// The input asks for nothing. Any words — or none. The single big button is
// the whole ask: "I need help" submits whatever is there, including nothing
// (Path C). One tap target, 44px+ everywhere.

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
};

const FragmentInput = forwardRef<HTMLInputElement, Props>(function FragmentInput(
  { value, onChange, onSubmit, busy },
  ref
) {
  return (
    <form
      className="flex gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="What happened, in any words — or none"
        placeholder="any words — or none"
        autoComplete="off"
        spellCheck={false}
        className="min-h-[56px] flex-1 rounded-lg border-2 border-[color:var(--edge-strong)] bg-card px-5 text-[22px] text-ink"
      />
      <button
        type="submit"
        disabled={busy}
        className="min-h-[56px] shrink-0 rounded-lg bg-signal px-7 text-[22px] font-bold text-white transition-colors duration-[120ms] hover:bg-[#163f75] disabled:opacity-[0.85]"
      >
        I need help
      </button>
    </form>
  );
});

export default FragmentInput;
