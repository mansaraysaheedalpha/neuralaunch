"use client";

import {
  ToolShell,
  ToolShellLoading,
  ToolShellNoRoadmap,
} from "@/components/institute/tools";
import { CoachWorkspace } from "./CoachWorkspace";
import { useCoachController } from "./use-coach-controller";

const SHELL = {
  model: "Opus",
  toolName: "Conversation Coach",
  roman: "I" as const,
  description: "Rehearse the conversation that decides the outcome",
  heading: (
    <>
      Coach the <em>conversation.</em>
    </>
  ),
  lede: (
    <>
      Build the opening, objections, and fallback positions—then rehearse the
      conversation <em>in character.</em>
    </>
  ),
};

export default function StandaloneCoachPage() {
  const c = useCoachController();
  if (c.stage === "no_roadmap")
    return (
      <ToolShellNoRoadmap
        {...SHELL}
        message="The Conversation Coach needs your discovery context. Start a discovery session first."
      />
    );
  if (c.stage === "loading" || !c.roadmapId)
    return <ToolShellLoading {...SHELL} />;
  return (
    <ToolShell {...SHELL} flush>
      <CoachWorkspace
        stage={c.stage}
        roadmapId={c.roadmapId}
        sessionId={c.sessionId}
        setup={c.setup}
        preparation={c.preparation}
        debrief={c.debrief}
        seedDraft={c.seedDraft}
        error={c.error}
        meterRefreshKey={c.meterRefreshKey}
        historyRefreshKey={c.historyRefreshKey}
        prepareJob={c.prepareJob}
        onNew={c.newSession}
        onSelect={(id) => {
          void c.selectSession(id);
        }}
        onPrepare={(setup, id) => {
          void c.prepare(setup, id);
        }}
        onRetry={c.retryPrepare}
        onRolePlayEnd={() => {
          void c.endRolePlay();
        }}
        onUsage={c.refreshUsageAndHistory}
        onStage={c.setStage}
      />
    </ToolShell>
  );
}
