"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createClientFixtureResponse,
  fixtureReceiptForCandidate,
} from "@/lib/demo";
import {
  DEFAULT_FRAGMENT_BY_EMAIL,
  FIXTURE_EMAILS,
  LEGACY_GOLDEN_RESPONSE,
} from "@/lib/fixtures";
import { countWords } from "@/lib/text";
import type {
  ActionReceipt,
  CandidateView,
  PipelineEvent,
  ResolveResponse,
} from "@/lib/types";
import { EvidencePanel, type EvidenceRecord } from "./EvidencePanel";
import { FragmentInput } from "./FragmentInput";
import { LegacyPanel } from "./LegacyPanel";
import { Meters } from "./Meters";
import { WordlessPanel } from "./WordlessPanel";
import {
  PresenterBar,
  type PresenterStepId,
} from "./PresenterBar";
import {
  ReasoningStream,
  type ReasoningEntry,
} from "./ReasoningStream";
import {
  ScorePanel,
  type HypothesisScore,
  type SemanticComparison,
} from "./ScorePanel";
import {
  DEFAULT_TOOL_STAGES,
  ToolRail,
  type ToolId,
  type ToolStage,
} from "./ToolRail";

type ExperienceStage = "idle" | "streaming" | "ready" | "acting" | "receipt";

const initialDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
const PATHS = {
  1: "order wrong the thing help",
  2: "the boily thing broke",
  3: "",
} as const;

const TOOL_LOGOS: Partial<Record<ToolId, string>> = {
  composio: "/logos/composio-logo-black.svg",
  codex: "/logos/openai-wordmark.webp",
};

function initialTools(): ToolStage[] {
  return DEFAULT_TOOL_STAGES.map((stage) => ({
    ...stage,
    logoSrc: TOOL_LOGOS[stage.id],
  }));
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSemanticPath(fragment: string): boolean {
  return normalize(fragment) === PATHS[2];
}

function pause(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function* parseEventStream(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<PipelineEvent> {
  if (!response.body) throw new Error("The pipeline stream was unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const payload = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (payload) yield JSON.parse(payload) as PipelineEvent;
    }

    if (done) break;
  }
}

function noActionReceipt(): ActionReceipt {
  return {
    status: "not_completed",
    title: "Sent to a person to finish.",
    detail: "The account connection did not confirm the action.",
    reference: "Zendesk ticket #4471 is ready for a support specialist.",
    source: "fallback",
  };
}

export function WordlessDemo() {
  const email = FIXTURE_EMAILS[0];
  const [fragment, setFragment] = useState(DEFAULT_FRAGMENT_BY_EMAIL[email]);
  const [submittedFragment, setSubmittedFragment] = useState("");
  const [demoMode, setDemoMode] = useState(initialDemoMode);
  const [stage, setStage] = useState<ExperienceStage>("idle");
  const [result, setResult] = useState<ResolveResponse | null>(null);
  const [legacyText, setLegacyText] = useState("");
  const [legacyTyping, setLegacyTyping] = useState(false);
  const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [meterWords, setMeterWords] = useState(0);
  const [turns, setTurns] = useState(0);
  const [tools, setTools] = useState<ToolStage[]>(initialTools);
  const [reasoning, setReasoning] = useState<ReasoningEntry[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [hypotheses, setHypotheses] = useState<HypothesisScore[]>([]);
  const [comparisons, setComparisons] = useState<SemanticComparison[]>([]);
  const [evidenceElapsed, setEvidenceElapsed] = useState<number>();
  const [presenterEnabled, setPresenterEnabled] = useState(false);
  const [presenterPath, setPresenterPath] = useState<1 | 2 | 3>(1);
  const [presenterStep, setPresenterStep] = useState<PresenterStepId>("input");

  const inputRef = useRef<HTMLInputElement>(null);
  const choiceHeadingRef = useRef<HTMLHeadingElement>(null);
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null);
  const activeController = useRef<AbortController | null>(null);
  const reasoningId = useRef(0);
  const evidenceId = useRef(0);
  const hypothesisId = useRef(0);
  const semanticId = useRef(0);
  const presenterBudget = useRef(0);
  const presenterEnabledRef = useRef(false);
  const gateWaiters = useRef(new Set<() => void>());

  const busy = stage === "streaming" || stage === "acting";
  const shownWords = stage === "idle" ? countWords(fragment) : meterWords;

  const releaseGates = useCallback(() => {
    for (const release of gateWaiters.current) release();
    gateWaiters.current.clear();
  }, []);

  const setBudget = useCallback(
    (value: number) => {
      presenterBudget.current = value;
      releaseGates();
    },
    [releaseGates],
  );

  const waitForPresenter = useCallback(async (required: number) => {
    while (
      presenterEnabledRef.current &&
      presenterBudget.current < required &&
      !activeController.current?.signal.aborted
    ) {
      await new Promise<void>((resolve) => gateWaiters.current.add(resolve));
    }
  }, []);

  const reset = useCallback(
    (focus = true, nextFragment?: string) => {
      activeController.current?.abort();
      activeController.current = null;
      releaseGates();
      setStage("idle");
      setResult(null);
      setReceipt(null);
      setLegacyText("");
      setLegacyTyping(false);
      setSubmittedFragment("");
      setMeterWords(0);
      setTurns(0);
      setTools(initialTools());
      setReasoning([]);
      setEvidence([]);
      setHypotheses([]);
      setComparisons([]);
      setEvidenceElapsed(undefined);
      setPresenterStep("input");
      setBudget(0);
      if (nextFragment !== undefined) setFragment(nextFragment);
      if (focus) window.requestAnimationFrame(() => inputRef.current?.focus());
    },
    [releaseGates, setBudget],
  );

  const updateTool = useCallback(
    (tool: ToolId, update: Partial<ToolStage>) => {
      setTools((current) =>
        current.map((stageItem) =>
          stageItem.id === tool ? { ...stageItem, ...update } : stageItem,
        ),
      );
    },
    [],
  );

  const appendHeading = useCallback(async (text: string, signal: AbortSignal) => {
    const id = `reason-${reasoningId.current++}`;
    setReasoning((current) => [
      ...current.map((entry) =>
        entry.state === "current" ? { ...entry, state: "complete" as const } : entry,
      ),
      { id, kind: "heading", text, state: "current" },
    ]);
    await pause(550, signal);
    setReasoning((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, state: "complete" as const } : entry,
      ),
    );
  }, []);

  const appendLine = useCallback(async (text: string, signal: AbortSignal) => {
    const id = `reason-${reasoningId.current++}`;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setReasoning((current) => [
      ...current.map((entry) =>
        entry.state === "current" ? { ...entry, state: "complete" as const } : entry,
      ),
      { id, kind: "line", text: reducedMotion ? text : "", state: "current" },
    ]);

    if (!reducedMotion) {
      for (let index = 1; index <= text.length && !signal.aborted; index += 1) {
        setReasoning((current) =>
          current.map((entry) =>
            entry.id === id ? { ...entry, text: text.slice(0, index) } : entry,
          ),
        );
        await pause(32, signal);
      }
    }

    setReasoning((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, text, state: "complete" as const } : entry,
      ),
    );
    await pause(380, signal);
  }, []);

  const typeLegacy = useCallback(async (text: string, signal: AbortSignal) => {
    setLegacyTyping(true);
    setLegacyText("");
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    await pause(reducedMotion ? 250 : 1_450, signal);
    if (reducedMotion) {
      setLegacyText(text);
    } else {
      for (let index = 1; index <= text.length && !signal.aborted; index += 1) {
        setLegacyText(text.slice(0, index));
        await pause(22, signal);
      }
    }
    if (!signal.aborted) setLegacyTyping(false);
  }, []);

  const showFallback = useCallback(
    async (fallback: ResolveResponse, signal: AbortSignal) => {
      updateTool("composio", {
        state: "skipped",
        label: "fixtures",
        simulated: true,
      });
      updateTool("octen", {
        state: fragment.trim() ? "skipped" : "skipped",
        label: fragment.trim() ? "fixtures" : "no fragment",
        simulated: true,
      });
      updateTool("codex", {
        state: "skipped",
        label: "fixtures",
        simulated: true,
      });
      await appendHeading(fragment.trim() ? "· reading the account" : "· no message", signal);
      await appendLine(
        fragment.trim()
          ? "Reading from cache. The merchant records are still available."
          : "Nothing was typed. That's fine. The account is enough on its own.",
        signal,
      );
      await appendHeading("· writing the choices", signal);
      await appendLine("Three cards, plain language, every title under seven words.", signal);
      setResult(fallback);
      setMeterWords(countWords(fragment));
      setTurns(1);
      setStage("ready");
    },
    [appendHeading, appendLine, fragment, updateTool],
  );

  const submitFragment = useCallback(
    async (override?: string) => {
      const submitted = override ?? fragment;
      activeController.current?.abort();
      const controller = new AbortController();
      activeController.current = controller;
      const { signal } = controller;

      setSubmittedFragment(submitted);
      setStage("streaming");
      setResult(null);
      setReceipt(null);
      setLegacyText("");
      setLegacyTyping(false);
      setMeterWords(0);
      setTurns(0);
      setTools(initialTools());
      setReasoning([]);
      setEvidence([]);
      setHypotheses([]);
      setComparisons([]);
      setEvidenceElapsed(undefined);
      reasoningId.current = 0;
      evidenceId.current = 0;
      hypothesisId.current = 0;
      semanticId.current = 0;

      if (presenterEnabledRef.current && presenterBudget.current < 1) {
        setBudget(1);
        setPresenterStep("composio");
      }

      void typeLegacy(LEGACY_GOLDEN_RESPONSE, signal);
      let visualPhase = 1;

      try {
        const response = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, fragment: submitted, demoMode }),
          signal,
        });
        if (!response.ok) throw new Error("The account pipeline did not start.");

        for await (const event of parseEventStream(response, signal)) {
          if (signal.aborted) return;
          if (event.t === "stage_start" && event.tool === "octen") visualPhase = 2;
          if (event.t === "reason_head" && event.text === "· what I found") {
            visualPhase = 3;
          }
          if (event.t === "stage_start" && event.tool === "codex") visualPhase = 4;
          await waitForPresenter(visualPhase);
          if (signal.aborted) return;

          switch (event.t) {
            case "stage_start":
              updateTool(event.tool, {
                state: "running",
                label: event.label,
                latencyMs: undefined,
                simulated: event.simulated,
              });
              break;
            case "stage_done":
              updateTool(event.tool, {
                state:
                  event.state === "fallback" || event.state === "skipped"
                    ? "skipped"
                    : "done",
                label:
                  event.state === "fallback"
                    ? "fixtures"
                    : event.state === "skipped"
                      ? "not needed"
                      : "complete",
                latencyMs: event.ms,
                simulated: event.simulated,
              });
              if (event.tool === "composio") setEvidenceElapsed(event.ms);
              await pause(event.simulated ? Math.min(event.ms, 320) : 80, signal);
              break;
            case "reason_head":
              await appendHeading(event.text, signal);
              break;
            case "reason_line":
              await appendLine(event.text, signal);
              break;
            case "evidence":
              setEvidence((current) => [
                ...current,
                {
                  id: `evidence-${evidenceId.current++}`,
                  source: event.source,
                  line: event.line,
                  raw: event.raw,
                  hit: event.hit,
                },
              ]);
              await pause(90, signal);
              break;
            case "hypothesis":
              setHypotheses((current) => [
                ...current,
                {
                  id: `hypothesis-${hypothesisId.current++}`,
                  kind: event.kind,
                  base: event.base,
                  recency: event.recency,
                  semantic: event.semantic,
                  total: event.total,
                  fired: event.fired,
                  why: event.why,
                },
              ]);
              await pause(120, signal);
              break;
            case "semantic":
              if (
                isSemanticPath(submitted) &&
                event.target === "prior_ticket_followup"
              ) {
                break;
              }
              setComparisons((current) => [
                ...current,
                {
                  id: `semantic-${semanticId.current++}`,
                  label: event.target.replaceAll("_", " "),
                  target: event.token,
                  keyword: event.keyword,
                  octen: event.octen,
                  strongest:
                    event.target === "wrong_item" && event.octen >= 0.81,
                },
              ]);
              await pause(90, signal);
              break;
            case "candidates": {
              const rankByKind = new Map(
                event.cards.map((card, index) => [card.kind, index + 1]),
              );
              setHypotheses((current) =>
                current.map((item) => ({
                  ...item,
                  rank: item.fired ? rankByKind.get(item.kind) : undefined,
                })),
              );
              setResult(event.response);
              if (!demoMode && event.response.legacy !== LEGACY_GOLDEN_RESPONSE) {
                setLegacyText(event.response.legacy);
                setLegacyTyping(false);
              }
              setMeterWords(countWords(submitted));
              setTurns(1);
              setStage("ready");
              window.requestAnimationFrame(() => choiceHeadingRef.current?.focus());
              break;
            }
            case "error":
              updateTool(event.tool, {
                state: "skipped",
                label: "fixtures",
                simulated: false,
              });
              break;
          }
        }
      } catch (error) {
        if (signal.aborted) return;
        console.info("[Wordless] Using the complete client fixture", error);
        const fallback = createClientFixtureResponse(email, submitted);
        await showFallback(fallback, signal);
      } finally {
        if (activeController.current === controller) activeController.current = null;
      }
    },
    [
      appendHeading,
      appendLine,
      demoMode,
      email,
      fragment,
      setBudget,
      showFallback,
      typeLegacy,
      updateTool,
      waitForPresenter,
    ],
  );

  const chooseCandidate = useCallback(
    async (candidate: CandidateView) => {
      if (!result || stage === "acting") return;
      setStage("acting");
      setPresenterStep("receipt");
      setBudget(6);
      const controller = new AbortController();
      activeController.current?.abort();
      activeController.current = controller;

      updateTool("zendesk", {
        state: "running",
        label:
          candidate.kind === "duplicate_charge"
            ? "refunding + closing ticket"
            : "opening support action",
        simulated: result.mode !== "live",
      });
      await appendLine(
        candidate.kind === "duplicate_charge"
          ? "Issuing the refund. Closing ticket #4471."
          : `Sending “${candidate.title}” to the support team.`,
        controller.signal,
      );

      let nextReceipt: ActionReceipt;
      const startedAt = performance.now();
      try {
        if (candidate.actionToken.startsWith("local-fixture:")) {
          await pause(620, controller.signal);
          nextReceipt = fixtureReceiptForCandidate(result.email, candidate.id);
        } else {
          const response = await fetch("/api/act", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actionToken: candidate.actionToken }),
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(4_000),
            ]),
          });
          if (!response.ok) throw new Error("The selected action did not complete.");
          nextReceipt = (await response.json()) as ActionReceipt;
        }
      } catch (error) {
        console.info("[Wordless] Action handed to a person", error);
        nextReceipt = result.mode === "live" ? noActionReceipt() : fixtureReceiptForCandidate(result.email, candidate.id);
      }

      const actionMs = Math.max(500, Math.round(performance.now() - startedAt));
      const isRefund = candidate.kind === "duplicate_charge" && nextReceipt.status === "completed";
      setEvidence((current) => [
        ...current,
        {
          id: `evidence-${evidenceId.current++}`,
          source: isRefund ? "stripe" : "zendesk",
          line: isRefund
            ? "re_3PqX · $84.00 · succeeded · ch_9002"
            : nextReceipt.reference,
          raw: {
            status: nextReceipt.status,
            reference: nextReceipt.reference,
            candidate: candidate.id,
          },
          hit: true,
          write: true,
        },
      ]);
      updateTool("zendesk", {
        state: "done",
        label: isRefund ? "ticket #4471 closed" : "action recorded",
        latencyMs: actionMs,
        simulated: nextReceipt.source !== "live",
      });
      setReceipt(nextReceipt);
      setStage("receipt");
      window.requestAnimationFrame(() => receiptHeadingRef.current?.focus());
      activeController.current = null;
    },
    [appendLine, result, setBudget, stage, updateTool],
  );

  const jumpToPath = useCallback(
    (path: 1 | 2 | 3) => {
      setPresenterPath(path);
      reset(true, PATHS[path]);
    },
    [reset],
  );

  const advancePresenter = useCallback(() => {
    switch (presenterStep) {
      case "input":
        setBudget(1);
        setPresenterStep("composio");
        void submitFragment();
        break;
      case "composio":
        setBudget(2);
        setPresenterStep("octen");
        break;
      case "octen":
        setBudget(3);
        setPresenterStep("scoring");
        break;
      case "scoring":
        setBudget(4);
        setPresenterStep("cards");
        break;
      case "cards":
        setBudget(5);
        setPresenterStep("tap");
        break;
      case "tap":
        if (result?.candidates[0]) void chooseCandidate(result.candidates[0]);
        break;
      case "receipt":
        break;
    }
  }, [chooseCandidate, presenterStep, result, setBudget, submitFragment]);

  useEffect(() => {
    const enabled = new URLSearchParams(window.location.search).get("present") === "1";
    presenterEnabledRef.current = enabled;
    if (enabled) {
      const frame = window.requestAnimationFrame(() => setPresenterEnabled(true));
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    if (presenterEnabled) return;
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLocaleLowerCase("en-US");
      if (event.key === "Escape") {
        event.preventDefault();
        reset();
      } else if ((event.metaKey || event.ctrlKey) && key === "d") {
        event.preventDefault();
        setDemoMode((current) => !current);
        reset(false);
      } else if (event.key === "1" || event.key === "2" || event.key === "3") {
        if (event.target instanceof HTMLInputElement) return;
        event.preventDefault();
        jumpToPath(Number(event.key) as 1 | 2 | 3);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [jumpToPath, presenterEnabled, reset]);

  useEffect(
    () => () => {
      activeController.current?.abort();
      releaseGates();
    },
    [releaseGates],
  );

  return (
    <main className="wordless-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <h1>Wordless<span aria-hidden="true">.</span></h1>
          <p>Point instead of explaining.</p>
        </div>
        <Meters words={shownWords} turns={turns} />
      </header>

      <FragmentInput
        email={email}
        accountName="Maria O."
        fragment={fragment}
        inputRef={inputRef}
        busy={busy}
        identityText="Maria O. · Account already attached to this request"
        label="Use any words you have"
        onChange={setFragment}
        onSubmit={() => void submitFragment()}
      />

      <section className="customer-zone" aria-label="Support choices">
        <LegacyPanel
          text={legacyText}
          active={stage !== "idle"}
          typing={legacyTyping}
          eyebrow="What the machine heard"
          heading="A confident guess"
          warning="It answered a question Maria did not ask."
          emptyMessage="Words alone leave the system guessing."
        />
        <WordlessPanel
          candidates={result?.candidates ?? []}
          receipt={receipt}
          active={Boolean(result) || Boolean(receipt)}
          ready={stage === "ready" || stage === "acting" || stage === "receipt"}
          acting={stage === "acting"}
          headingRef={choiceHeadingRef}
          receiptHeadingRef={receiptHeadingRef}
          eyebrow="What actually happened"
          heading="Choose what you mean"
          statusText="Your account found these. You don’t need to explain."
          emptyTitle={stage === "streaming" ? "Reading your account." : "Your account can speak first."}
          emptyDetail={stage === "streaming" ? "The choices will appear here." : "Use any words you have—or no words at all."}
          onChoose={chooseCandidate}
          onReset={() => reset()}
        />
      </section>

      <div className="judge-surface" aria-hidden="true">
        <ToolRail stages={tools} />
        <section className="engine-zone">
          <ReasoningStream entries={reasoning} title="Reasoning stream" />
          <div className="engine-data-stack">
            <EvidencePanel records={evidence} elapsedMs={evidenceElapsed} />
            <ScorePanel
              mode={isSemanticPath(submittedFragment) ? "semantic" : "hypotheses"}
              comparisons={comparisons}
              hypotheses={hypotheses}
            />
          </div>
        </section>
      </div>

      {!demoMode ? (
        <div className="live-indicator" aria-label="Live integrations requested">
          <span aria-hidden="true" /> Live requested
        </div>
      ) : null}

      <PresenterBar
        enabled={presenterEnabled}
        currentStep={presenterStep}
        path={presenterPath}
        onAdvance={advancePresenter}
        onReplay={() => reset(false, PATHS[presenterPath])}
        onJumpPath={jumpToPath}
        onToggleDemo={() => {
          setDemoMode((current) => !current);
          reset(false);
        }}
        onReset={() => reset()}
      />
    </main>
  );
}
