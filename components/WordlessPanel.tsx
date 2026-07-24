import type { ActionReceipt, CandidateView } from "@/lib/types";
import { CandidateCard } from "./CandidateCard";
import { ReceiptPanel } from "./ReceiptPanel";

export interface WordlessPanelProps {
  candidates: CandidateView[];
  receipt: ActionReceipt | null;
  active: boolean;
  ready: boolean;
  acting: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  receiptHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  eyebrow?: string;
  heading?: string;
  statusText?: string;
  emptyTitle?: string;
  emptyDetail?: string;
  escalationLabel?: string;
  className?: string;
  onChoose: (candidate: CandidateView) => void;
  onReset: () => void;
  onEscalate?: () => void;
}

export function WordlessPanel({
  candidates,
  receipt,
  active,
  ready,
  acting,
  headingRef,
  receiptHeadingRef,
  eyebrow = "What your account shows",
  heading = "Point to what you mean",
  statusText = "Reading your account. You don’t need to explain.",
  emptyTitle = "Your account can speak first.",
  emptyDetail = "Use any words you have—or no words at all.",
  escalationLabel = "Talk to a person",
  className = "",
  onChoose,
  onReset,
  onEscalate,
}: WordlessPanelProps) {
  const classes = ["comparison-panel", "wordless-panel", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={classes}
      aria-labelledby="wordless-heading"
      aria-busy={acting ? "true" : undefined}
      data-active={active ? "true" : "false"}
      data-ready={ready ? "true" : "false"}
    >
      <div className="panel-heading-row">
        <div>
          <p className="eyebrow wordless-eyebrow">{eyebrow}</p>
          <h2 id="wordless-heading" ref={headingRef} tabIndex={-1}>
            {heading}
          </h2>
        </div>
        <span className="panel-symbol wordless-symbol" aria-hidden="true">
          →
        </span>
      </div>

      {!active ? (
        <div className="panel-empty wordless-empty">
          <p>{emptyTitle}</p>
          <p>{emptyDetail}</p>
        </div>
      ) : receipt ? (
        <ReceiptPanel
          receipt={receipt}
          headingRef={receiptHeadingRef}
          onReset={onReset}
        />
      ) : (
        <div
          className={"wordless-results" + (ready ? " results-ready" : "")}
          data-testid="wordless-results"
        >
          <p className="wordless-status" role="status">
            <span className="status-mark" aria-hidden="true">
              ✓
            </span>
            {statusText}
          </p>
          {candidates.length > 0 ? (
            <div
              className="candidate-list"
              aria-live="polite"
              aria-atomic="true"
              aria-label={candidates.length + " account choices"}
            >
              {candidates.map((candidate, index) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  index={index}
                  disabled={acting}
                  state={acting ? "acting" : ready ? "visible" : "queued"}
                  onChoose={onChoose}
                />
              ))}
            </div>
          ) : (
            <div className="wordless-no-results">
              <p>A person can take over from here.</p>
              <button
                type="button"
                className="escalation-button"
                onClick={onEscalate ?? onReset}
              >
                {onEscalate ? escalationLabel : "Start again"}
              </button>
            </div>
          )}
          {acting ? (
            <p className="acting-note" role="status">
              Completing the action you chose.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
