export interface LegacyPanelProps {
  text: string;
  active: boolean;
  typing?: boolean;
  eyebrow?: string;
  heading?: string;
  warning?: string;
  emptyMessage?: string;
  className?: string;
}

export function LegacyPanel({
  text,
  active,
  typing = false,
  eyebrow = "Simulated chatbot guess",
  heading = "What the words alone suggest",
  warning = "It answered a question you did not ask.",
  emptyMessage = "A description-first chatbot waits for a complete question.",
  className = "",
}: LegacyPanelProps) {
  const classes = ["comparison-panel", "legacy-panel", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={classes}
      aria-labelledby="legacy-heading"
      aria-busy={typing ? "true" : undefined}
      data-active={active ? "true" : "false"}
      data-typing={typing ? "true" : "false"}
    >
      <div className="panel-heading-row">
        <div>
          <p className="eyebrow legacy-eyebrow">{eyebrow}</p>
          <h2 id="legacy-heading">{heading}</h2>
        </div>
        <span className="panel-symbol legacy-symbol" aria-hidden="true">
          ?
        </span>
      </div>

      {active ? (
        <>
          <div
            className="legacy-answer"
            data-testid="legacy-answer"
            aria-label="Simulated chatbot response"
          >
            <p>
              {text || "\u00a0"}
              {typing ? (
                <span className="legacy-cursor" aria-hidden="true">
                  ▋
                </span>
              ) : null}
            </p>
          </div>
          <p className="legacy-warning">
            <span aria-hidden="true">!</span>
            {warning}
          </p>
        </>
      ) : (
        <div className="panel-empty legacy-empty">
          <p>{emptyMessage}</p>
          <span aria-hidden="true" className="empty-line" />
          <span aria-hidden="true" className="empty-line short" />
        </div>
      )}
    </section>
  );
}
