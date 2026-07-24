import type { CandidateView } from "@/lib/types";
import type { CSSProperties } from "react";

export type CandidateCardState = "queued" | "visible" | "acting";

export interface CandidateCardProps {
  candidate: CandidateView;
  index: number;
  disabled?: boolean;
  state?: CandidateCardState;
  evidenceLabel?: string;
  hideEvidence?: boolean;
  onChoose: (candidate: CandidateView) => void;
  onEvidenceToggle?: (open: boolean, candidate: CandidateView) => void;
}

export function CandidateCard({
  candidate,
  index,
  disabled = false,
  state = "visible",
  evidenceLabel = "Why this result",
  hideEvidence = false,
  onChoose,
  onEvidenceToggle,
}: CandidateCardProps) {
  const detailId = "candidate-detail-" + candidate.id;
  const classes = [
    "candidate-card",
    "candidate-card-" + state,
  ].join(" ");

  return (
    <article
      className={classes}
      data-candidate-kind={candidate.kind}
      data-candidate-rank={index + 1}
      data-state={state}
      style={{ "--card-index": index } as CSSProperties}
    >
      <button
        type="button"
        className="candidate-button"
        disabled={disabled}
        onClick={() => onChoose(candidate)}
        aria-describedby={detailId}
        aria-busy={state === "acting" ? "true" : undefined}
      >
        <span className="candidate-number" aria-hidden="true">
          {index + 1}
        </span>
        <span className="candidate-copy">
          <span className="candidate-title">{candidate.title}</span>
          <span id={detailId} className="candidate-detail">
            {candidate.detail}
          </span>
          <span className="candidate-action">
            {candidate.actionLabel}
            <span aria-hidden="true"> →</span>
          </span>
        </span>
      </button>
      {!hideEvidence && candidate.evidence.length > 0 ? (
        <details
          className="evidence candidate-evidence"
          onToggle={(event) =>
            onEvidenceToggle?.(event.currentTarget.open, candidate)
          }
        >
          <summary>
            {evidenceLabel}
            <span className="visually-hidden">
              {" for " + candidate.title}
            </span>
          </summary>
          <ul>
            {candidate.evidence.map((fact, factIndex) => (
              <li key={candidate.id + "-evidence-" + factIndex}>{fact}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
