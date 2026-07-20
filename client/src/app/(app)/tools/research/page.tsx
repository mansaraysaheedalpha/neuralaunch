"use client";
// src/app/(app)/tools/research/page.tsx
//
// Institute-treatment Research Tool interior (PR 15-Research). Two
// columns inside <ToolShell flush>: composer + step-trail on the
// left, findings ledger on the right. The transport layer
// (useResearchFlow) is untouched — engine, plan, model wiring, source
// extraction, confidence classification all preserved verbatim. This
// page is render only.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Loader2, Plus } from "lucide-react";
import {
  ToolShell,
  ToolShellLoading,
  ToolShellNoRoadmap,
} from "@/components/institute/tools";
import {
  ResearchComposer,
  PlanReview,
  StepTrail,
  FindingsLedger,
  FollowUpComposer,
} from "@/components/institute/tools/research";
import { useResearchFlow } from "@/app/(app)/discovery/roadmap/[id]/research/useResearchFlow";
import {
  readPackagerHandoffParams,
  fetchPackagerHandoff,
  buildResearchQueryFromPackage,
} from "@/app/(app)/tools/packager-handoff";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { ToolRecoveryNotice } from "@/components/institute/tools/ToolRecoveryNotice";

/* -------------------------------------------------------------------- */
/*  Shell entrypoint                                                    */
/* -------------------------------------------------------------------- */

const SHELL = {
  model: "Opus",
  toolName: "Research Tool",
  roman: "III" as const,
  description: "Plain-language query → cited findings",
  heading: (
    <>
      Ask in plain language.
      <br />
      <em>Get back structured truth.</em>
    </>
  ),
  lede: (
    <>
      A multi-step research pass across the open web. Every finding carries its{" "}
      <em>sources</em> and a confidence label — verified, likely, or unverified.
      No confident-sounding guesses.
    </>
  ),
};

export default function StandaloneResearchPage() {
  const [roadmapId, setRoadmapId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seedQuery, setSeedQuery] = useState<string | undefined>(undefined);
  const [meterRefreshKey, setMeterRefreshKey] = useState(0);

  const handleToolCallComplete = useCallback(() => {
    setMeterRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/discovery/roadmaps/has-any");
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const json = (await res.json()) as {
          hasRoadmap: boolean;
          roadmapId?: string;
        };
        if (json.hasRoadmap && json.roadmapId) setRoadmapId(json.roadmapId);
      } catch {
        /* fall through */
      }

      // Packager → Research handoff: when the URL carries fromPackager,
      // fetch the package and build a sensible initial research query
      // for the founder to confirm or edit before submitting.
      const handoffParams = readPackagerHandoffParams();
      if (handoffParams) {
        const handoff = await fetchPackagerHandoff(
          handoffParams.roadmapId,
          handoffParams.sessionId,
        );
        if (handoff) setSeedQuery(buildResearchQueryFromPackage(handoff));
      }

      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <ToolShellLoading {...SHELL} />;
  }

  if (!roadmapId) {
    return (
      <ToolShellNoRoadmap
        {...SHELL}
        message="The Research Tool needs your discovery context to produce relevant results. Start a discovery session first."
      />
    );
  }

  return (
    <ResearchLoaded
      roadmapId={roadmapId}
      seedQuery={seedQuery}
      meterRefreshKey={meterRefreshKey}
      onToolCallComplete={handleToolCallComplete}
    />
  );
}

/* -------------------------------------------------------------------- */
/*  Loaded interior — useResearchFlow lives here so it's only mounted   */
/*  after the roadmap-id resolves.                                       */
/* -------------------------------------------------------------------- */

interface ResearchLoadedProps {
  roadmapId: string;
  seedQuery: string | undefined;
  meterRefreshKey: number;
  onToolCallComplete: () => void;
}

function ResearchLoaded({
  roadmapId,
  seedQuery,
  meterRefreshKey,
  onToolCallComplete,
}: ResearchLoadedProps) {
  const flow = useResearchFlow({
    roadmapId,
    taskId: "standalone",
    standalone: true,
    onToolCallComplete,
  });

  const isPlanning = flow.stage === "planning";
  const isExecuting = flow.stage === "executing";
  const isReport = flow.stage === "report";
  const isPlanReview = flow.stage === "plan_review";

  const leftStatus = LEFT_STATUS[flow.stage];
  const rightStatus =
    isReport && flow.report
      ? `${flow.report.findings.length} findings`
      : isExecuting
        ? "Working…"
        : isPlanning || isPlanReview
          ? "Awaiting plan"
          : "Awaiting query";

  // taskId is read by ToolShell from the URL; we only need it here for
  // optional acknowledgement actions on the FindingsLedger.
  const taskScoped =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("task") !== null;

  // executingJobComplete drives the StepTrail's freeze + reconciliation.
  const jobStage = flow.executeJob?.stage;
  const executingDone = jobStage === "complete";

  // Surfaced as "Completed in ~N steps" on the synthesis header. The
  // engine doesn't expose the real researchLog count via
  // ToolJobStatus.metadata today (a sensible follow-up) so we use the
  // trail's full budget once the run reports complete — same number
  // the trail displayed at the moment of completion.
  const completedSteps = executingDone || isReport ? 25 : 0;

  return (
    <ToolShell {...SHELL} flush>
      {/* Top action row — meter + new research, sits flush above the
          two-column body. */}
      <div className="flex flex-wrap items-center gap-4 border-b border-rule px-6 py-3 sm:px-12">
        <UsageMeter tool="research" refreshKey={meterRefreshKey} />
        <div className="ml-auto">
          <button
            type="button"
            onClick={flow.resetToQuery}
            className="inline-flex items-center gap-1.5 border border-rule-strong px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
          >
            <Plus aria-hidden="true" className="size-3" />
            New research
          </button>
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-56px)] grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
        {/* ── Left column ─────────────────────────────────────────── */}
        <div className="border-b border-rule lg:border-b-0 lg:border-r lg:border-rule px-6 pb-20 pt-10 sm:px-12">
          <ColLab left="Your question" right={leftStatus} />

          {flow.error && (
            <ToolRecoveryNotice
              message={flow.error}
              onRetry={
                flow.executeJob?.stage === "complete" && flow.sessionId
                  ? () => {
                      void flow.handleLoadSession(flow.sessionId!);
                    }
                  : undefined
              }
              retryLabel="Load saved result"
              workPreserved="Your query, approved plan, and every server-saved finding remain in research history."
              leaveGuidance="It is safe to leave; reopen this research session from history to load the saved result."
              operationStatus={
                flow.executeJob?.stage === "complete"
                  ? "completed_not_loaded"
                  : "stopped"
              }
              usageStatus="server_reconciled"
              className="mb-6"
            />
          )}

          {flow.stage === "query" && (
            <ResearchComposer
              initialQuery={seedQuery}
              onSubmit={(q) => {
                void flow.handleQuerySubmit(q);
              }}
              busy={false}
            />
          )}

          {isPlanning && (
            <div
              className="flex flex-col items-start gap-3 py-2"
              role="status"
              aria-live="polite"
            >
              <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                <Loader2 aria-hidden="true" className="size-3 animate-spin" />
                Generating · research plan
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Opus is decomposing the question and naming the sources to
                search.
              </p>
            </div>
          )}

          {isPlanReview && (
            <PlanReview
              query={flow.query}
              plan={flow.plan}
              estimatedTime={flow.estimatedTime}
              onApprove={(p) => {
                void flow.handlePlanApprove(p);
              }}
              onCancel={flow.resetToQuery}
            />
          )}

          {isExecuting && (
            <>
              {jobStage === "failed" ? (
                <ExecutionFailed
                  message={
                    flow.executeJob?.errorMessage ?? "Research run failed."
                  }
                  onRetry={flow.handleRetryExecute}
                />
              ) : (
                <StepTrail
                  key={flow.query}
                  query={flow.query}
                  complete={executingDone}
                  budget={25}
                />
              )}
            </>
          )}

          {isReport && flow.report && (
            <div className="flex flex-col gap-7">
              <div className="flex flex-col gap-2">
                <ColLabSubtle text="Question · resolved" />
                <p className="font-serif text-[20px] italic leading-snug text-fg">
                  {flow.query}
                </p>
              </div>
              <FollowUpComposer
                round={flow.followUps.length}
                busy={flow.followUpLoading}
                onSubmit={(q) => {
                  void flow.handleFollowUp(q);
                }}
              />
              {flow.followUps.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                    Follow-ups · {flow.followUps.length}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {flow.followUps.map((fu) => (
                      <li
                        key={fu.round}
                        className="border-l-2 border-rule-strong bg-bg-2 px-4 py-2 text-[13px] leading-snug text-fg-2"
                      >
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mr-2">
                          R{fu.round}
                        </span>
                        {fu.query}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right column ────────────────────────────────────────── */}
        <div className="px-6 pb-20 pt-10 sm:px-12">
          <ColLab left="Findings" right={rightStatus} />

          {(flow.stage === "query" || isPlanning || isPlanReview) && (
            <EmptyOutput />
          )}

          {isExecuting && !executingDone && (
            <WorkingOutput key={flow.query} query={flow.query} />
          )}

          {isReport && flow.report && (
            <FindingsLedger
              query={flow.query}
              report={flow.report}
              stepCount={completedSteps || 25}
              taskScoped={taskScoped}
              onAttachToTask={
                taskScoped
                  ? () => {
                      /* persisted on accept */
                    }
                  : undefined
              }
            />
          )}

          {/* If the run completed but for some reason no report parsed,
              surface the empty-but-done state honestly rather than a
              perpetual spinner. */}
          {isExecuting && executingDone && !flow.report && (
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Research complete · loading report…
            </p>
          )}

          {/* Follow-up in flight: show a small line above the ledger. */}
          {isReport && flow.followUpLoading && (
            <div className="mt-6 inline-flex items-center gap-2 border-l-2 border-accent bg-bg-2 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              <Loader2
                aria-hidden="true"
                className="size-3 animate-spin text-accent"
              />
              Follow-up · running
            </div>
          )}
        </div>
      </div>
    </ToolShell>
  );
}

/* -------------------------------------------------------------------- */
/*  Small helpers — locally scoped, not export                          */
/* -------------------------------------------------------------------- */

type StageLeftStatus =
  | "Ready"
  | "Planning…"
  | "Plan ready"
  | "Researching…"
  | "Complete";

const LEFT_STATUS: Record<
  "query" | "planning" | "plan_review" | "executing" | "report",
  StageLeftStatus
> = {
  query: "Ready",
  planning: "Planning…",
  plan_review: "Plan ready",
  executing: "Researching…",
  report: "Complete",
};

function ColLab({ left, right }: { left: string; right: ReactNode }) {
  return (
    <div className="mb-7 flex items-baseline justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
      <span>{left}</span>
      <span className="text-accent">{right}</span>
    </div>
  );
}

function ColLabSubtle({ text }: { text: string }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
      {text}
    </span>
  );
}

function EmptyOutput() {
  return (
    <div className="flex flex-col items-center gap-4 border border-dashed border-rule-strong px-8 py-14 text-center">
      <span
        aria-hidden="true"
        className="font-serif text-[64px] leading-none italic text-muted-2"
      >
        ⁇
      </span>
      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          Findings appear here
        </p>
        <p className="font-mono text-[10px] tracking-[0.10em] text-muted">
          Each one cited and confidence-labelled.
        </p>
      </div>
    </div>
  );
}

function WorkingOutput({ query }: { query: string }) {
  // Mount-time start, captured in an effect so Date.now() isn't called
  // during render (React 19's purity rule). Parent keys on `query` so
  // a fresh run remounts and the timer naturally resets to 0.
  const startedAtRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    startedAtRef.current = Date.now();
    const id = setInterval(() => {
      const t = startedAtRef.current;
      if (t == null) return;
      setElapsed(Math.floor((Date.now() - t) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-4 border border-rule-strong bg-bg-2 px-6 py-7">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        <Loader2
          aria-hidden="true"
          className="inline-block size-3 mr-2 animate-spin"
        />
        Researching · ~25 steps · multi-source
      </p>
      <p className="max-w-[520px] font-serif text-[16px] italic leading-snug text-fg">
        {query}
      </p>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        Elapsed · {Math.floor(elapsed / 60)}m{" "}
        {String(elapsed % 60).padStart(2, "0")}s · findings appear when the run
        completes.
      </p>
    </div>
  );
}

function ExecutionFailed({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <ToolRecoveryNotice
      message={message}
      onRetry={onRetry}
      retryLabel="Retry research"
      workPreserved="Your question and approved research plan are preserved."
      leaveGuidance="It is safe to leave; the failed job has stopped and the plan remains in this session."
      operationStatus="stopped"
      usageStatus="may_be_consumed"
    />
  );
}
