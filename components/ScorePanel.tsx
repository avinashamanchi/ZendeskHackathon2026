import type { CSSProperties } from "react";

export interface HypothesisScore {
  id: string;
  kind: string;
  base?: number;
  recency?: number;
  semantic?: number;
  total?: number;
  fired: boolean;
  rank?: number;
  why?: string;
}

export interface SemanticComparison {
  id: string;
  label: string;
  target?: string;
  keyword: number;
  octen: number;
  strongest?: boolean;
}

export interface ScorePanelProps {
  hypotheses?: readonly HypothesisScore[];
  comparisons?: readonly SemanticComparison[];
  mode?: "hypotheses" | "semantic";
  title?: string;
  emptyText?: string;
  className?: string;
}

function bounded(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function score(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(2).replace(/^0/, "");
}

export function ScorePanel({
  hypotheses = [],
  comparisons = [],
  mode = comparisons.length > 0 ? "semantic" : "hypotheses",
  title = "Scores",
  emptyText = "Scores will appear here.",
  className = "",
}: ScorePanelProps) {
  const classes = ["score-panel", "score-panel-" + mode, className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} aria-label={title}>
      <div className="engine-panel-heading">
        <h3>{title}</h3>
        <span className="score-mode">
          {mode === "semantic" ? "keyword vs Octen" : "all candidates"}
        </span>
      </div>

      {mode === "semantic" ? (
        comparisons.length > 0 ? (
          <table className="semantic-score-table">
            <caption className="visually-hidden">
              Keyword and Octen semantic similarity comparison
            </caption>
            <thead>
              <tr>
                <th scope="col">match</th>
                <th scope="col">keyword</th>
                <th scope="col">Octen</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((comparison) => (
                <tr
                  className={
                    comparison.strongest
                      ? "semantic-row semantic-row-strongest"
                      : "semantic-row"
                  }
                  key={comparison.id}
                >
                  <th scope="row">
                    <span>{comparison.label}</span>
                    {comparison.target ? (
                      <small>{comparison.target}</small>
                    ) : null}
                  </th>
                  <td
                    className={
                      comparison.keyword === 0
                        ? "semantic-keyword semantic-zero"
                        : "semantic-keyword"
                    }
                  >
                    <data value={comparison.keyword}>
                      {score(comparison.keyword)}
                    </data>
                  </td>
                  <td className="semantic-octen">
                    <div
                      className="semantic-score-bar"
                      style={
                        {
                          "--semantic-score": bounded(comparison.octen),
                        } as CSSProperties
                      }
                    >
                      <span aria-hidden="true" />
                      <data value={comparison.octen}>
                        {score(comparison.octen)}
                      </data>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="engine-panel-empty">{emptyText}</p>
        )
      ) : hypotheses.length > 0 ? (
        <ol className="hypothesis-score-list">
          {hypotheses.map((hypothesis) => {
            const totalRatio = bounded((hypothesis.total ?? 0) / 2);
            const rowClasses = [
              "hypothesis-score-row",
              hypothesis.fired
                ? "hypothesis-score-fired"
                : "hypothesis-score-rejected",
            ].join(" ");

            return (
              <li
                className={rowClasses}
                data-fired={hypothesis.fired ? "true" : "false"}
                key={hypothesis.id}
                style={
                  {
                    "--hypothesis-score": totalRatio,
                  } as CSSProperties
                }
              >
                <div className="hypothesis-score-main">
                  <span className="hypothesis-kind">{hypothesis.kind}</span>
                  {hypothesis.fired ? (
                    <span className="hypothesis-equation">
                      <data value={hypothesis.base}>
                        {score(hypothesis.base)}
                      </data>
                      <span aria-hidden="true"> + </span>
                      <data value={hypothesis.recency}>
                        {score(hypothesis.recency)}
                      </data>
                      <span aria-hidden="true"> + </span>
                      <data value={hypothesis.semantic}>
                        {score(hypothesis.semantic)}
                      </data>
                      <span aria-hidden="true"> = </span>
                      <strong>
                        <data value={hypothesis.total}>
                          {score(hypothesis.total)}
                        </data>
                      </strong>
                    </span>
                  ) : (
                    <span className="hypothesis-reason">
                      {hypothesis.why ?? "not fired"}
                    </span>
                  )}
                  <span className="hypothesis-result">
                    {hypothesis.fired ? "FIRED" : "not fired"}
                    {hypothesis.rank ? (
                      <span className="hypothesis-rank">
                        {" #" + hypothesis.rank}
                      </span>
                    ) : null}
                  </span>
                </div>
                <span className="hypothesis-score-track" aria-hidden="true">
                  <span />
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="engine-panel-empty">{emptyText}</p>
      )}
    </section>
  );
}
