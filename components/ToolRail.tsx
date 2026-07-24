"use client";

import type { ToolName } from "@/lib/types";

// DEMO-CRITICAL. The strip between the customer and engine zones: four
// chips with official logos (never redrawn), live states, and honest
// latency — simulated numbers carry a `sim` marker (§12.4). Octen's chip is
// the one to watch: a two-digit millisecond number beside their logo.

export interface ChipState {
  status: "idle" | "running" | "done" | "skipped";
  label?: string;
  ms?: number;
  sim?: boolean;
}

const TOOLS: { name: ToolName; logo: string; wordmark: string }[] = [
  { name: "composio", logo: "/logos/composio-gh.png", wordmark: "composio" },
  { name: "octen", logo: "/logos/octen.ico", wordmark: "octen" },
  { name: "codex", logo: "/logos/openai.svg", wordmark: "codex" },
  { name: "zendesk", logo: "/logos/zendesk.svg", wordmark: "zendesk" },
];

function Chip({ tool, state }: { tool: (typeof TOOLS)[number]; state: ChipState }) {
  const { status } = state;
  const dim = status === "idle";
  return (
    <div
      className={`flex items-center gap-2 rounded-full border-2 px-3 py-1 ${
        status === "skipped"
          ? "border-dashed border-[color:var(--engine-dim)]"
          : status === "running"
            ? "chip-running border-[color:var(--engine-hit)]"
            : status === "done"
              ? "border-[color:var(--engine-dim)]"
              : "border-transparent"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${
          status === "idle" || status === "skipped"
            ? "border border-[color:var(--engine-dim)]"
            : "bg-[color:var(--engine-hit)]"
        }`}
      />
      {/* Idle dims the LOGO only — label text keeps full contrast (§15). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tool.logo}
        alt=""
        className="h-[22px] w-auto"
        style={{
          opacity: dim ? 0.35 : 1,
          filter: dim
            ? "grayscale(1) invert(1)"
            : tool.name === "zendesk" || tool.name === "codex"
              ? "invert(1)"
              : "none",
        }}
      />
      <span
        className={`text-[13px] ${dim ? "text-[color:var(--engine-dim)]" : "text-[color:var(--engine-ink)]"}`}
      >
        {tool.wordmark}
      </span>
      <span className="min-w-[64px] text-[13px] tabular-nums text-[color:var(--engine-dim)]">
        {status === "running"
          ? state.label
          : status === "skipped"
            ? state.label ?? "fixtures"
            : status === "done" && state.ms != null
              ? `${state.ms}ms${state.sim ? " sim" : ""}`
              : ""}
      </span>
    </div>
  );
}

export default function ToolRail({ chips }: { chips: Record<ToolName, ChipState> }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto bg-[color:var(--engine-bg)] px-6 py-2">
      {TOOLS.map((tool, i) => (
        <div key={tool.name} className="flex items-center gap-1">
          {i > 0 ? (
            <span
              aria-hidden="true"
              className="px-1 text-[13px] transition-colors duration-[400ms]"
              style={{
                color:
                  chips[TOOLS[i - 1].name].status === "done" ||
                  chips[TOOLS[i - 1].name].status === "skipped"
                    ? "var(--engine-hit)"
                    : "var(--engine-dim)",
              }}
            >
              ──→
            </span>
          ) : null}
          <Chip tool={tool} state={chips[tool.name]} />
        </div>
      ))}
    </div>
  );
}
