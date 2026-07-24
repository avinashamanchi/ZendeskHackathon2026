/* eslint-disable @next/next/no-img-element */

export type ToolId = "composio" | "octen" | "codex" | "zendesk";
export type ToolStageState = "idle" | "running" | "done" | "skipped";

export interface ToolStage {
  id: ToolId;
  name: string;
  state: ToolStageState;
  label?: string;
  latencyMs?: number;
  simulated?: boolean;
  logoSrc?: string;
}

export interface ToolRailProps {
  stages?: readonly ToolStage[];
  label?: string;
  className?: string;
}

export const DEFAULT_TOOL_STAGES: readonly ToolStage[] = [
  { id: "composio", name: "Composio", state: "idle" },
  { id: "octen", name: "Octen", state: "idle" },
  { id: "codex", name: "Codex", state: "idle" },
  { id: "zendesk", name: "Zendesk", state: "idle" },
];

function stageStatus(stage: ToolStage): string {
  if (stage.label) return stage.label;
  if (stage.state === "running") return "working";
  if (stage.state === "done") return "complete";
  if (stage.state === "skipped") return "fixtures";
  return "waiting";
}

function shownLatency(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export function ToolRail({
  stages = DEFAULT_TOOL_STAGES,
  label = "Wordless engine pipeline",
  className = "",
}: ToolRailProps) {
  const classes = ["tool-rail", className].filter(Boolean).join(" ");

  return (
    <section className={classes} aria-label={label}>
      <ol className="tool-rail-list">
        {stages.map((stage, index) => {
          const latency = shownLatency(stage.latencyMs);
          const connectorComplete =
            stage.state === "done" || stage.state === "skipped";

          return (
            <li
              className={"tool-rail-item tool-rail-item-" + stage.state}
              data-state={stage.state}
              data-tool={stage.id}
              key={stage.id}
            >
              <div className="tool-chip">
                <span className="tool-state-mark" aria-hidden="true" />
                {stage.logoSrc ? (
                  <img
                    className="tool-logo"
                    src={stage.logoSrc}
                    alt=""
                    width={88}
                    height={22}
                  />
                ) : null}
                <span className="tool-name">{stage.name}</span>
                <span className="tool-status">{stageStatus(stage)}</span>
                {latency !== null && stage.state === "done" ? (
                  <span className="tool-latency">
                    <data value={latency}>{latency}</data>ms
                    {stage.simulated ? (
                      <abbr className="tool-simulated" title="Simulated timing">
                        sim
                      </abbr>
                    ) : null}
                  </span>
                ) : null}
              </div>
              {index < stages.length - 1 ? (
                <span
                  className={
                    "tool-connector" +
                    (connectorComplete ? " tool-connector-complete" : "")
                  }
                  data-complete={connectorComplete ? "true" : "false"}
                  aria-hidden="true"
                >
                  <span className="tool-connector-track" />
                  <span className="tool-connector-fill" />
                  <span className="tool-connector-arrow">→</span>
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
