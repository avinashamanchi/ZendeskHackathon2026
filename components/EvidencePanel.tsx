export interface EvidenceRecord {
  id: string;
  source: string;
  line: string;
  raw?: unknown;
  hit?: boolean;
  write?: boolean;
}

export interface EvidencePanelProps {
  records: readonly EvidenceRecord[];
  elapsedMs?: number;
  title?: string;
  emptyText?: string;
  className?: string;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Raw record unavailable.";
  }
}

function shownElapsed(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export function EvidencePanel({
  records,
  elapsedMs,
  title = "Evidence",
  emptyText = "Records will appear here.",
  className = "",
}: EvidencePanelProps) {
  const sources = new Set(records.map((record) => record.source)).size;
  const elapsed = shownElapsed(elapsedMs);
  const classes = ["evidence-panel", className].filter(Boolean).join(" ");

  return (
    <section className={classes} aria-label={title}>
      <div className="engine-panel-heading">
        <h3>{title}</h3>
        <p className="engine-panel-meta">
          <span>{records.length} rec</span>
          <span aria-hidden="true"> · </span>
          <span>{sources} src</span>
          {elapsed !== null ? (
            <>
              <span aria-hidden="true"> · </span>
              <span>
                <data value={elapsed}>{elapsed}</data>ms
              </span>
            </>
          ) : null}
        </p>
      </div>

      {records.length === 0 ? (
        <p className="engine-panel-empty">{emptyText}</p>
      ) : (
        <ol className="evidence-list">
          {records.map((record) => {
            const rowClasses = [
              "evidence-row",
              record.hit ? "evidence-row-hit" : "",
              record.write ? "evidence-row-write" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <li
                className={rowClasses}
                data-hit={record.hit ? "true" : "false"}
                data-source={record.source}
                data-write={record.write ? "true" : "false"}
                key={record.id}
              >
                <div className="evidence-row-line">
                  <span className="evidence-source">{record.source}</span>
                  <span className="evidence-summary">{record.line}</span>
                  {record.write ? (
                    <strong className="evidence-marker evidence-marker-write">
                      WRITE
                    </strong>
                  ) : record.hit ? (
                    <strong className="evidence-marker evidence-marker-hit">
                      hit
                    </strong>
                  ) : null}
                </div>
                {record.raw !== undefined ? (
                  <pre className="evidence-raw" aria-hidden="true">
                    {safeJson(record.raw)}
                  </pre>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
