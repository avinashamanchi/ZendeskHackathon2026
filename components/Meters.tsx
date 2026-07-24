export interface MetersProps {
  words: number;
  turns: number;
  animate?: boolean;
  wordLabel?: string;
  turnLabel?: string;
  className?: string;
}

function count(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function Meters({
  words,
  turns,
  animate = false,
  wordLabel = "words",
  turnLabel = "turns",
  className = "",
}: MetersProps) {
  const wordCount = count(words);
  const turnCount = count(turns);
  const classes = ["meters", animate ? "meters-animating" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <dl
      className={classes}
      aria-label={wordCount + " words, " + turnCount + " turns used"}
      data-animate={animate ? "true" : "false"}
    >
      <div className="meter">
        <dt>{wordLabel}</dt>
        <dd data-testid="word-count">
          <data value={wordCount}>{wordCount}</data>
        </dd>
      </div>
      <div className="meter">
        <dt>{turnLabel}</dt>
        <dd data-testid="turn-count">
          <data value={turnCount}>{turnCount}</data>
        </dd>
      </div>
    </dl>
  );
}
