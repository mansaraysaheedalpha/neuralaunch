"use client";

import { Loader2, Plus } from "lucide-react";
import { motion } from "motion/react";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { ToolJobProgress } from "@/components/tool-jobs/ToolJobProgress";
import { ToolRecoveryNotice } from "@/components/institute/tools/ToolRecoveryNotice";
import { ResponsiveToolHistory } from "@/components/institute/tools/ResponsiveToolHistory";
import {
  PackagerEmptyState,
  SituationInput,
} from "@/components/institute/tools/packager";
import { PackagerAdjustInput } from "@/app/(app)/discovery/roadmap/[id]/packager/PackagerAdjustInput";
import { PackagerContextView } from "@/app/(app)/discovery/roadmap/[id]/packager/PackagerContextView";
import { PackagerHandoffButtons } from "@/app/(app)/discovery/roadmap/[id]/packager/PackagerHandoffButtons";
import { ServicePackageView } from "@/app/(app)/discovery/roadmap/[id]/packager/ServicePackageView";
import type {
  ServiceContext,
  ServicePackage,
} from "@/lib/roadmap/service-packager/schemas";
import type { ToolJobStatus } from "@/lib/tool-jobs";
import { PackagerHistoryPanel } from "./PackagerHistoryPanel";

type WorkspaceStage =
  | "intro"
  | "loading_context"
  | "context"
  | "loading_generation"
  | "output";

interface PackagerWorkspaceProps {
  stage: WorkspaceStage;
  roadmapId: string;
  sessionId: string | null;
  draft: string;
  context: ServiceContext | null;
  agentMessage: string | null;
  pkg: ServicePackage | null;
  adjustments: number;
  pending: boolean;
  error: string | null;
  meterRefreshKey: number;
  historyRefreshKey: number;
  generateJob: ToolJobStatus | null;
  adjustJob: ToolJobStatus | null;
  operationStatus: "stopped" | "running_unknown" | "completed_not_loaded";
  onDraftChange: (value: string) => void;
  onStart: (description: string) => void;
  onNew: () => void;
  onSelectSession: (sessionId: string) => void;
  onConfirmContext: () => void;
  onAdjustContext: (message: string) => void;
  onAdjustPackage: (message: string) => void;
  onRetryGenerate: () => void;
}

export function PackagerWorkspace(props: PackagerWorkspaceProps) {
  const history = (
    <ResponsiveToolHistory label="Package history">
      <PackagerHistoryPanel
        roadmapId={props.roadmapId}
        activeSessionId={props.sessionId}
        onSelect={props.onSelectSession}
        refreshKey={props.historyRefreshKey}
      />
    </ResponsiveToolHistory>
  );
  return (
    <>
      <div className="flex items-center gap-5 border-b border-rule px-6 py-3 sm:px-10">
        <UsageMeter
          tool="packager"
          refreshKey={props.meterRefreshKey}
          className="min-w-0 flex-1 !rounded-none !border-0 !bg-transparent !p-0"
        />
        <button
          type="button"
          onClick={props.onNew}
          className="flex shrink-0 items-center gap-1.5 border border-rule-strong px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-fg hover:border-accent hover:text-accent"
        >
          <Plus className="size-3" />
          New package
        </button>
      </div>
      {props.error && (
        <ToolRecoveryNotice
          message={props.error}
          onRetry={
            props.stage === "loading_generation"
              ? props.onRetryGenerate
              : undefined
          }
          workPreserved="Your description, confirmed context, and last saved package remain available."
          leaveGuidance="Saved packages remain in history. Copy any unsent adjustment text before leaving."
          operationStatus={props.operationStatus}
          usageStatus="may_be_consumed"
          className="border-x-0 border-t-0 px-6 sm:px-10"
        />
      )}
      <div className="grid min-h-[620px] lg:grid-cols-[1fr_1.45fr]">
        {props.stage === "intro" && (
          <>
            <div className="border-r border-rule">
              <SituationInput
                value={props.draft}
                onChange={props.onDraftChange}
                onSubmit={props.onStart}
              />
              <div className="px-6 pb-8 sm:px-10">{history}</div>
            </div>
            <PackagerEmptyState />
          </>
        )}
        {props.stage === "loading_context" && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center gap-3 border-r border-rule p-12 font-mono text-[10px] uppercase tracking-[0.14em] text-muted"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="size-4 animate-spin text-accent" />
              Reading venture evidence…
            </motion.div>
            <PackagerEmptyState status="Synthesising" active />
          </>
        )}
        {props.stage === "context" && props.context && (
          <>
            <div className="border-r border-rule">
              <PackagerContextView
                context={props.context}
                pending={props.pending}
                agentNote={props.agentMessage}
                onConfirm={props.onConfirmContext}
                onAdjust={props.onAdjustContext}
              />
            </div>
            <PackagerEmptyState status="Evidence ready" />
          </>
        )}
        {props.stage === "loading_generation" && (
          <>
            <div className="border-r border-rule p-8">
              <ToolJobProgress
                title="Building your service package"
                stage={props.generateJob?.stage ?? "queued"}
                errorMessage={props.generateJob?.errorMessage}
                toolType="packager_generate"
                onRetry={props.onRetryGenerate}
              />
            </div>
            <PackagerEmptyState status="Building…" active />
          </>
        )}
        {props.stage === "output" && props.pkg && props.sessionId && (
          <>
            <aside className="order-2 flex flex-col gap-6 border-r border-rule px-6 py-8 sm:px-10 lg:order-1">
              <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
                <span>01 · Session</span>
                <span className="text-accent">Saved</span>
              </div>
              {history}
              {props.pending && (
                <ToolJobProgress
                  title="Applying your refinement"
                  stage={props.adjustJob?.stage ?? "queued"}
                  errorMessage={props.adjustJob?.errorMessage}
                  toolType="packager_adjust"
                />
              )}
              <PackagerAdjustInput
                adjustmentsUsed={props.adjustments}
                pending={props.pending}
                onAdjust={props.onAdjustPackage}
              />
              <PackagerHandoffButtons
                roadmapId={props.roadmapId}
                packagerSessionId={props.sessionId}
              />
            </aside>
            <div className="order-1 min-w-0 lg:order-2">
              <ServicePackageView
                pkg={props.pkg}
                roadmapId={props.roadmapId}
                sessionId={props.sessionId}
                onRegenerate={(model) =>
                  props.onAdjustPackage(
                    `Rebuild these tiers using a ${model.toLowerCase()} pricing model.`,
                  )
                }
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
