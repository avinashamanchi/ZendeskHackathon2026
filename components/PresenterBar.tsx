"use client";

import { useEffect } from "react";

export type PresenterStepId =
  | "input"
  | "composio"
  | "octen"
  | "scoring"
  | "cards"
  | "tap"
  | "receipt";

export interface PresenterStep {
  id: PresenterStepId;
  label: string;
}

export interface PresenterBarProps {
  enabled: boolean;
  currentStep: PresenterStepId;
  steps?: readonly PresenterStep[];
  path?: 1 | 2 | 3;
  onAdvance: () => void;
  onReplay: () => void;
  onJumpPath: (path: 1 | 2 | 3) => void;
  onToggleDemo: () => void;
  onReset: () => void;
  className?: string;
}

export const DEFAULT_PRESENTER_STEPS: readonly PresenterStep[] = [
  { id: "input", label: "Input" },
  { id: "composio", label: "Composio" },
  { id: "octen", label: "Octen" },
  { id: "scoring", label: "Scoring" },
  { id: "cards", label: "Cards" },
  { id: "tap", label: "Tap" },
  { id: "receipt", label: "Receipt" },
];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function PresenterBar({
  enabled,
  currentStep,
  steps = DEFAULT_PRESENTER_STEPS,
  path = 1,
  onAdvance,
  onReplay,
  onJumpPath,
  onToggleDemo,
  onReset,
  className = "",
}: PresenterBarProps) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const editable = isEditableTarget(event.target);
      const key = event.key.toLocaleLowerCase("en-US");

      if (event.key === "Escape") {
        event.preventDefault();
        onReset();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && key === "d") {
        event.preventDefault();
        onToggleDemo();
        return;
      }

      if (editable || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.code === "Space") {
        event.preventDefault();
        onAdvance();
      } else if (key === "r") {
        event.preventDefault();
        onReplay();
      } else if (event.key === "1" || event.key === "2" || event.key === "3") {
        event.preventDefault();
        onJumpPath(Number(event.key) as 1 | 2 | 3);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    enabled,
    onAdvance,
    onJumpPath,
    onReplay,
    onReset,
    onToggleDemo,
  ]);

  if (!enabled) return null;

  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStep),
  );
  const classes = ["presenter-bar", className].filter(Boolean).join(" ");

  return (
    <aside
      className={classes}
      aria-label="Presenter controls"
      data-current-step={currentStep}
    >
      <div className="presenter-current">
        <span className="presenter-path">Path {path}</span>
        <span className="presenter-step-count">
          Step {currentIndex + 1} of {steps.length}
        </span>
      </div>
      <ol className="presenter-steps">
        {steps.map((step, index) => {
          const state =
            index < currentIndex
              ? "complete"
              : index === currentIndex
                ? "current"
                : "upcoming";

          return (
            <li
              className={"presenter-step presenter-step-" + state}
              data-state={state}
              key={step.id}
              aria-current={state === "current" ? "step" : undefined}
            >
              {step.label}
            </li>
          );
        })}
      </ol>
      <p className="presenter-shortcuts">
        <kbd>Space</kbd> next
        <span aria-hidden="true"> · </span>
        <kbd>R</kbd> replay
        <span aria-hidden="true"> · </span>
        <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> paths
        <span aria-hidden="true"> · </span>
        <kbd>Esc</kbd> reset
      </p>
    </aside>
  );
}
