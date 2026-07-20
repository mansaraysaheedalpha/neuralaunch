"use client";

import { Loader2, Plus } from "lucide-react";
import { UsageMeter } from "@/components/billing/UsageMeter";
import { ToolJobProgress } from "@/components/tool-jobs/ToolJobProgress";
import { ToolRecoveryNotice } from "@/components/institute/tools/ToolRecoveryNotice";
import { ResponsiveToolHistory } from "@/components/institute/tools/ResponsiveToolHistory";
import { CoachSetupChat } from "@/app/(app)/discovery/roadmap/[id]/coach/CoachSetupChat";
import { PreparationView } from "@/app/(app)/discovery/roadmap/[id]/coach/PreparationView";
import { RolePlayChat } from "@/app/(app)/discovery/roadmap/[id]/coach/RolePlayChat";
import { DebriefView } from "@/app/(app)/discovery/roadmap/[id]/coach/DebriefView";
import type {
  ConversationSetup,
  Debrief,
  PreparationPackage,
} from "@/lib/roadmap/coach";
import type { ToolJobStatus } from "@/lib/tool-jobs";
import type { CoachStage } from "./use-coach-controller";
import { CoachHistoryPanel } from "./CoachHistoryPanel";

interface Props {
  stage: Exclude<CoachStage, "loading" | "no_roadmap">;
  roadmapId: string;
  sessionId: string | null;
  setup: ConversationSetup | null;
  preparation: PreparationPackage | null;
  debrief: Debrief | null;
  seedDraft?: string;
  error: string | null;
  meterRefreshKey: number;
  historyRefreshKey: number;
  prepareJob: ToolJobStatus | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onPrepare: (setup: ConversationSetup, id?: string) => void;
  onRetry: () => void;
  onRolePlayEnd: () => void;
  onUsage: () => void;
  onStage: (stage: CoachStage) => void;
}

export function CoachWorkspace(p: Props) {
  const history = (
    <ResponsiveToolHistory label="Rehearsal history">
      <CoachHistoryPanel
        roadmapId={p.roadmapId}
        activeSessionId={p.sessionId}
        onSelect={p.onSelect}
        refreshKey={p.historyRefreshKey}
      />
    </ResponsiveToolHistory>
  );
  return (
    <>
      <div className="flex items-center gap-5 border-b border-rule px-6 py-3 sm:px-10">
        <UsageMeter
          tool="coach"
          refreshKey={p.meterRefreshKey}
          className="min-w-0 flex-1 !rounded-none !border-0 !bg-transparent !p-0"
        />
        <button
          type="button"
          onClick={p.onNew}
          className="flex items-center gap-1.5 border border-rule-strong px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-fg hover:border-accent hover:text-accent"
        >
          <Plus className="size-3" />
          New conversation
        </button>
      </div>
      {p.error && (
        <ToolRecoveryNotice
          message={p.error}
          onRetry={p.stage === "loading_preparation" ? p.onRetry : undefined}
          workPreserved="Your setup, preparation dossier, and completed rehearsal turns remain saved."
          leaveGuidance="Saved preparation and rehearsal turns remain in history; copy any unsent response before leaving."
          operationStatus="stopped"
          usageStatus="may_be_consumed"
          className="border-x-0 border-t-0 px-6 sm:px-10"
        />
      )}
      <div className="grid min-h-[640px] lg:grid-cols-[1fr_1.45fr]">
        <aside className="order-2 flex flex-col gap-4 border-r border-rule px-6 py-8 sm:px-10 lg:order-1">
          {history}
        </aside>
        <div className="order-1 min-w-0 lg:order-2">
          {p.stage === "setup" && (
            <CoachSetupChat
              roadmapId={p.roadmapId}
              taskId="standalone"
              standalone
              initialDraft={p.seedDraft}
              onSetupComplete={p.onPrepare}
              onCancel={() => {
                window.location.href = "/tools";
              }}
            />
          )}
          {p.stage === "loading_preparation" && (
            <div className="p-8">
              <ToolJobProgress
                title="Generating your preparation package"
                stage={p.prepareJob?.stage ?? "queued"}
                errorMessage={p.prepareJob?.errorMessage}
                toolType="coach_prepare"
                onRetry={p.onRetry}
              />
            </div>
          )}
          {p.stage === "preparation" && p.preparation && (
            <PreparationView
              preparation={p.preparation}
              channel={p.setup?.channel ?? "whatsapp"}
              roadmapId={p.roadmapId}
              sessionId={p.sessionId ?? undefined}
              onStartReplay={() => p.onStage("roleplay")}
            />
          )}
          {p.stage === "roleplay" && p.sessionId && (
            <RolePlayChat
              roadmapId={p.roadmapId}
              taskId="standalone"
              standalone
              sessionId={p.sessionId}
              otherPartyName={p.setup?.who ?? "The other party"}
              onEnd={p.onRolePlayEnd}
              onToolCallComplete={p.onUsage}
            />
          )}
          {p.stage === "loading_debrief" && (
            <div
              className="flex items-center justify-center gap-3 p-16 font-mono text-[9px] uppercase tracking-[0.14em] text-muted"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="size-4 animate-spin text-accent" />
              Reading the rehearsal…
            </div>
          )}
          {p.stage === "debrief" && p.debrief && (
            <DebriefView debrief={p.debrief} onDone={() => p.onStage("done")} />
          )}
          {p.stage === "done" && (
            <div className="p-12">
              <p className="font-serif text-[24px] italic text-fg">
                Preparation saved to this session.
              </p>
              <a
                href="/tools"
                className="mt-5 inline-block font-mono text-[9px] uppercase tracking-[0.14em] text-accent"
              >
                Return to tools →
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
