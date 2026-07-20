"use client";

import { Plus } from "lucide-react";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { ToolJobProgress } from "@/components/tool-jobs/ToolJobProgress";
import { ToolRecoveryNotice } from "@/components/institute/tools/ToolRecoveryNotice";
import { ResponsiveToolHistory } from "@/components/institute/tools/ResponsiveToolHistory";
import { ComposerContextChat } from "@/app/(app)/discovery/roadmap/[id]/composer/ComposerContextChat";
import { ComposerOutputView } from "@/app/(app)/discovery/roadmap/[id]/composer/ComposerOutputView";
import type {
  ComposerChannel,
  ComposerMode,
} from "@/lib/roadmap/composer/constants";
import type {
  ComposerOutput,
  OutreachContext,
} from "@/lib/roadmap/composer/schemas";
import type { ToolJobStatus } from "@/lib/tool-jobs";
import type { ComposerStage } from "./use-composer-controller";
import { ComposerHistoryPanel } from "./ComposerHistoryPanel";

interface ComposerWorkspaceProps {
  stage: Exclude<ComposerStage, "loading" | "no_roadmap">;
  roadmapId: string;
  sessionId: string | null;
  sentMessageIds: string[];
  seedDraft?: string;
  output: ComposerOutput | null;
  channel: ComposerChannel | null;
  mode: ComposerMode | null;
  error: string | null;
  meterRefreshKey: number;
  historyRefreshKey: number;
  generateJob: ToolJobStatus | null;
  operationStatus: "stopped" | "running_unknown" | "completed_not_loaded";
  onNew: () => void;
  onSelect: (id: string) => void;
  onContextComplete: (
    context: OutreachContext,
    mode: ComposerMode,
    channel: ComposerChannel,
  ) => void;
  onRetry: () => void;
  onToolCallComplete: () => void;
}

function EmptyDispatch({ active }: { active?: boolean }) {
  return (
    <section
      className="flex min-h-[520px] flex-col px-6 py-8 sm:px-10"
      aria-live="polite"
      aria-busy={Boolean(active)}
    >
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        <span>02 · Dispatches</span>
        <span className={active ? "text-accent" : ""}>
          {active ? "Composing…" : "Awaiting brief"}
        </span>
      </div>
      <div className="my-auto flex min-h-[300px] flex-col items-center justify-center border border-dashed border-rule-strong text-center">
        <span
          aria-hidden="true"
          className={`font-serif text-[48px] italic ${active ? "animate-pulse text-accent" : "text-muted-2"}`}
        >
          ¶
        </span>
        <p className="mt-4 font-mono text-[10px] uppercase leading-[1.8] tracking-[0.16em] text-muted">
          Send-ready copy appears here.
          <br />
          Rationale stays separate from the message.
        </p>
      </div>
    </section>
  );
}

export function ComposerWorkspace(props: ComposerWorkspaceProps) {
  const history = (
    <ResponsiveToolHistory label="Outreach history">
      <ComposerHistoryPanel
        roadmapId={props.roadmapId}
        activeSessionId={props.sessionId}
        onSelect={props.onSelect}
        refreshKey={props.historyRefreshKey}
      />
    </ResponsiveToolHistory>
  );
  return (
    <>
      <div className="flex items-center gap-5 border-b border-rule px-6 py-3 sm:px-10">
        <UsageMeter
          tool="composer"
          refreshKey={props.meterRefreshKey}
          className="min-w-0 flex-1 !rounded-none !border-0 !bg-transparent !p-0"
        />
        <button
          type="button"
          onClick={props.onNew}
          className="flex shrink-0 items-center gap-1.5 border border-rule-strong px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-fg hover:border-accent hover:text-accent"
        >
          <Plus className="size-3" />
          New outreach
        </button>
      </div>
      {props.error && (
        <ToolRecoveryNotice
          message={props.error}
          onRetry={
            props.stage === "loading_generation" ? props.onRetry : undefined
          }
          workPreserved="Your outreach context and every previously saved message remain available."
          leaveGuidance="Saved messages remain in history. Copy any unsent context draft before leaving."
          operationStatus={props.operationStatus}
          usageStatus="may_be_consumed"
          className="border-x-0 border-t-0 px-6 sm:px-10"
        />
      )}
      <div className="grid min-h-[640px] lg:grid-cols-[1fr_1.35fr]">
        {props.stage === "context" && (
          <>
            <div className="border-r border-rule">
              <ComposerContextChat
                roadmapId={props.roadmapId}
                taskId="standalone"
                standalone
                initialDraft={props.seedDraft}
                onContextComplete={props.onContextComplete}
                onCancel={() => {
                  window.location.href = "/tools";
                }}
              />
              <div className="px-6 pb-8 sm:px-10">{history}</div>
            </div>
            <EmptyDispatch />
          </>
        )}
        {props.stage === "loading_generation" && (
          <>
            <aside className="flex flex-col gap-6 border-r border-rule p-8">
              <ToolJobProgress
                title="Drafting your messages"
                stage={props.generateJob?.stage ?? "queued"}
                errorMessage={props.generateJob?.errorMessage}
                toolType="composer_generate"
                onRetry={props.onRetry}
              />
              {history}
            </aside>
            <EmptyDispatch active />
          </>
        )}
        {props.stage === "output" &&
          props.output &&
          props.channel &&
          props.mode &&
          props.sessionId && (
            <>
              <aside className="order-2 flex flex-col gap-6 border-r border-rule px-6 py-8 sm:px-10 lg:order-1">
                <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
                  <span>01 · Session</span>
                  <span className="text-accent">Saved</span>
                </div>
                {history}
              </aside>
              <div className="order-1 min-w-0 lg:order-2">
                <ComposerOutputView
                  key={props.sessionId}
                  output={props.output}
                  channel={props.channel}
                  mode={props.mode}
                  roadmapId={props.roadmapId}
                  taskId="standalone"
                  sessionId={props.sessionId}
                  sentMessageIds={props.sentMessageIds}
                  onDone={() => {
                    window.location.href = "/tools";
                  }}
                  onToolCallComplete={props.onToolCallComplete}
                />
              </div>
            </>
          )}
      </div>
    </>
  );
}
