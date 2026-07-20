"use client";

import {
  ToolShell,
  ToolShellLoading,
  ToolShellLoadError,
  ToolShellNoRoadmap,
} from "@/components/institute/tools";
import { ComposerWorkspace } from "./ComposerWorkspace";
import { useComposerController } from "./use-composer-controller";

const SHELL = {
  model: "Sonnet",
  toolName: "Outreach Composer",
  roman: "II" as const,
  description: "WhatsApp · email · LinkedIn — with rationale",
  heading: (
    <>
      Compose <em>outreach.</em>
    </>
  ),
  lede: (
    <>
      Single message, batch variations, or a <em>D1 / D5 / D14</em> sequence.
      WhatsApp, email, or LinkedIn — each draft comes with a short note on why
      it works.
    </>
  ),
};

export default function StandaloneComposerPage() {
  const controller = useComposerController();
  if (controller.stage === "loading" && controller.error)
    return <ToolShellLoadError {...SHELL} message={controller.error} />;
  if (controller.stage === "no_roadmap")
    return (
      <ToolShellNoRoadmap
        {...SHELL}
        message="The Outreach Composer needs your discovery context to produce useful messages. Start a discovery session first."
      />
    );
  if (controller.stage === "loading" || !controller.roadmapId)
    return <ToolShellLoading {...SHELL} />;

  return (
    <ToolShell {...SHELL} flush>
      <ComposerWorkspace
        stage={controller.stage}
        roadmapId={controller.roadmapId}
        sessionId={controller.sessionId}
        sentMessageIds={controller.sentMessageIds}
        seedDraft={controller.seedDraft}
        output={controller.output}
        channel={controller.channel}
        mode={controller.mode}
        error={controller.error}
        meterRefreshKey={controller.meterRefreshKey}
        historyRefreshKey={controller.historyRefreshKey}
        generateJob={controller.generateJob}
        operationStatus={controller.operationStatus}
        onNew={controller.newSession}
        onSelect={(id) => {
          void controller.selectSession(id);
        }}
        onContextComplete={(context, mode, channel) => {
          void controller.generate(context, mode, channel);
        }}
        onRetry={controller.retryGenerate}
        onToolCallComplete={controller.refreshUsageAndHistory}
      />
    </ToolShell>
  );
}
