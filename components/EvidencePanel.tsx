"use client";

// Records stream in as the reads land (§12.6). Rows that trigger a
// hypothesis carry the --engine-hit left border and a ◀ marker; the single
// write (the refund) gets a --signal border and a WRITE label. Hover any row
// for the raw JSON — proof it's real data, not a mock.

export interface EvidenceRowData {
  source: string;
  line: string;
  raw: object;
  hit: boolean;
  write?: boolean;
}

export default function EvidencePanel({
  rows,
  ms,
}: {
  rows: EvidenceRowData[];
  ms: number | null;
}) {
  const sources = new Set(rows.map((r) => r.source)).size;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-1 flex items-baseline justify-between text-[12px] uppercase tracking-[0.14em] text-[color:var(--engine-dim)]">
        <span>Evidence</span>
        <span className="normal-case tracking-normal tabular-nums">
          {rows.length > 0 ? `${rows.length} rec · ${sources} src${ms != null ? ` · ${ms}ms` : ""}` : "—"}
        </span>
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto font-mono text-[13px] leading-[1.7]">
        {rows.map((r, i) => (
          <div
            key={i}
            className={`row-in group relative flex gap-2 border-l-2 py-px pl-2 ${
              r.write
                ? "border-[color:var(--signal)] bg-[rgba(27,77,143,0.18)]"
                : r.hit
                  ? "border-[color:var(--engine-hit)]"
                  : "border-transparent"
            }`}
          >
            <span className="w-[60px] shrink-0 text-[color:var(--engine-dim)]">{r.source}</span>
            <span className="flex-1 truncate text-[color:var(--engine-ink)]">{r.line}</span>
            {r.write ? (
              <span className="shrink-0 text-[11px] font-bold tracking-wider text-[color:var(--signal-bg)]">
                WRITE
              </span>
            ) : r.hit ? (
              <span aria-hidden="true" className="shrink-0 text-[color:var(--engine-hit)]">
                ◀
              </span>
            ) : null}
            <pre className="pointer-events-none absolute right-0 top-full z-10 hidden max-w-[360px] overflow-hidden whitespace-pre-wrap rounded border border-[color:var(--engine-dim)] bg-[color:var(--engine-bg)] p-2 text-[11px] text-[color:var(--engine-ink)] group-hover:block">
              {JSON.stringify(r.raw, null, 1)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
