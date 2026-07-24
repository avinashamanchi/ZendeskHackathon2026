"use client";

import { useEffect, useMemo, useRef } from "react";

export type ReasoningEntryKind = "heading" | "line";
export type ReasoningEntryState = "complete" | "current" | "queued";

export interface ReasoningEntry {
  id: string;
  kind: ReasoningEntryKind;
  text: string;
  state?: ReasoningEntryState;
}

export interface ReasoningStreamProps {
  entries: readonly ReasoningEntry[];
  title?: string;
  emptyText?: string;
  showCursor?: boolean;
  autoScroll?: boolean;
  className?: string;
}

export function ReasoningStream({
  entries,
  title = "Reasoning",
  emptyText = "Waiting for the account.",
  showCursor = true,
  autoScroll = true,
  className = "",
}: ReasoningStreamProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentKey = useMemo(
    () =>
      entries
        .map((entry) => [entry.id, entry.kind, entry.state, entry.text].join(":"))
        .join("|"),
    [entries],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!autoScroll || !viewport) return;

    const frame = window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [autoScroll, contentKey]);

  const classes = ["reasoning-stream", className].filter(Boolean).join(" ");
  const currentEntryId = [...entries]
    .reverse()
    .find((entry) => entry.state === "current")?.id;

  return (
    <section className={classes} aria-label={title}>
      <div className="engine-panel-heading">
        <h3>{title}</h3>
        <span className="reasoning-state">
          {entries.length > 0 ? "live trace" : "waiting"}
        </span>
      </div>
      <div className="reasoning-viewport" ref={viewportRef}>
        {entries.length === 0 ? (
          <p className="reasoning-empty">{emptyText}</p>
        ) : (
          <div className="reasoning-lines">
            {entries.map((entry) => {
              const state = entry.state ?? "complete";
              const current = entry.id === currentEntryId;
              const entryClasses = [
                "reasoning-entry",
                "reasoning-" + entry.kind,
                "reasoning-" + state,
              ].join(" ");

              return (
                <p className={entryClasses} data-state={state} key={entry.id}>
                  <span>{entry.text}</span>
                  {current && showCursor && entry.kind === "line" ? (
                    <span className="reasoning-cursor" aria-hidden="true">
                      ▋
                    </span>
                  ) : null}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
