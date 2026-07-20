'use client';

import { ToolShell, ToolShellLoading, ToolShellNoRoadmap } from '@/components/institute/tools';
import { PackagerWorkspace } from './PackagerWorkspace';
import { usePackagerController } from './use-packager-controller';

const SHELL = {
  model: 'Sonnet',
  toolName: 'Service Packager',
  roman: 'IV' as const,
  description: 'Three priced tiers · revenue scenarios',
  heading: <>Package the <em>service.</em></>,
  lede: <>Three priced tiers from your situation — Starter, Pro, Premium — each with a feature list, a revenue scenario, and the reasoning behind the price.</>,
};

export default function StandalonePackagerPage() {
  const controller = usePackagerController();

  if (controller.stage === 'no_roadmap') {
    return (
      <ToolShellNoRoadmap
        {...SHELL}
        message="The Service Packager needs your discovery context to set pricing and scope. Start a discovery session first."
      />
    );
  }
  if (controller.stage === 'loading' || !controller.roadmapId) {
    return <ToolShellLoading {...SHELL} />;
  }

  return (
    <ToolShell {...SHELL} flush>
      <PackagerWorkspace
        stage={controller.stage}
        roadmapId={controller.roadmapId}
        sessionId={controller.sessionId}
        draft={controller.draft}
        context={controller.context}
        agentMessage={controller.agentMessage}
        pkg={controller.pkg}
        adjustments={controller.adjustments}
        pending={controller.pending}
        error={controller.error}
        meterRefreshKey={controller.meterRefreshKey}
        historyRefreshKey={controller.historyRefreshKey}
        generateJob={controller.generateJob}
        adjustJob={controller.adjustJob}
        onDraftChange={controller.setDraft}
        onStart={(description) => { controller.setDraft(description); void controller.start(description); }}
        onNew={controller.newSession}
        onSelectSession={(sessionId) => { void controller.selectSession(sessionId); }}
        onConfirmContext={() => { void controller.generate(); }}
        onAdjustContext={(message) => { void controller.adjustContext(message); }}
        onAdjustPackage={(message) => { void controller.adjustPackage(message); }}
        onRetryGenerate={controller.retryGenerate}
      />
    </ToolShell>
  );
}
