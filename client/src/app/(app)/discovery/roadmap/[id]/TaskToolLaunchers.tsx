'use client';
// src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx
//
// Hairline mono chip cluster for the five internal tools on an
// expanded task row. PR 16 converted the chips from inline-modal
// triggers to <Link>s that navigate to the standalone /tools/{slug}
// surface, passing `?task={taskId}&roadmap={roadmapId}` so the
// standalone ToolShell can render the task strip + a precise
// back-link to /discovery/roadmap/{id}.
//
// Session-review components stay — they surface what the founder
// produced when a prior tool session is persisted on the task.
// Validation session lives in a separate ValidationPage row keyed
// on (roadmapId, taskId), so we lazy-fetch its summary on mount
// when the tool is suggested on this task.

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type { StoredRoadmapTask } from '@/lib/roadmap/checkin-types';
import { UpgradePrompt } from '@/components/billing/UpgradePrompt';
import { useRoadmapWritability } from './RoadmapWritabilityContext';
import { ConversationCoachButton } from './coach/ConversationCoachButton';
import { CoachSessionReview }       from './coach/CoachSessionReview';
import { OutreachComposerButton }   from './composer/OutreachComposerButton';
import { ComposerSessionReview }    from './composer/ComposerSessionReview';
import { ResearchToolButton }       from './research/ResearchToolButton';
import { ResearchSessionReview }    from './research/ResearchSessionReview';
import { ServicePackagerButton }    from './packager/ServicePackagerButton';
import { PackagerSessionReview }    from './packager/PackagerSessionReview';
import { ValidationToolButton }     from './validation/ValidationToolButton';
import {
  ValidationSessionReview,
  type ValidationSessionSummary,
} from './validation/ValidationSessionReview';

export interface TaskToolLaunchersProps {
  roadmapId: string;
  taskId:    string;
  task:      StoredRoadmapTask;
}

export function TaskToolLaunchers({ roadmapId, taskId, task }: TaskToolLaunchersProps) {
  const { data: session } = useSession();
  const tier = session?.user?.tier ?? 'free';
  const { writable } = useRoadmapWritability();

  const suggestedTools = (task as { suggestedTools?: string[] }).suggestedTools;
  const coachSession    = (task as { coachSession?:    Record<string, unknown> }).coachSession;
  const composerSession = (task as { composerSession?: Record<string, unknown> }).composerSession;
  const researchSession = (task as { researchSession?: Record<string, unknown> }).researchSession;
  const packagerSession = (task as { packagerSession?: Record<string, unknown> }).packagerSession;

  // Validation stores its state in a separate ValidationPage row, so
  // fetch lazily when the tool is suggested on this task. null = not
  // yet fetched; undefined = fetched, none exists; else the summary.
  const validationSuggested = (suggestedTools ?? []).includes('validation');
  const [validationSession, setValidationSession] =
    useState<ValidationSessionSummary | null | undefined>(null);

  useEffect(() => {
    if (!validationSuggested) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/validation-page`,
          { method: 'GET' },
        );
        if (!res.ok) return;
        const json = await res.json() as {
          page:      { id: string; slug: string; status: 'DRAFT' | 'LIVE' | 'ARCHIVED' } | null;
          taskStale: boolean;
        };
        if (cancelled) return;
        setValidationSession(json.page
          ? { pageId: json.page.id, slug: json.page.slug, status: json.page.status, taskStale: json.taskStale }
          : undefined);
      } catch {
        // Silent: the chip still lets the founder navigate to the tool.
        if (!cancelled) setValidationSession(undefined);
      }
    })();
    return () => { cancelled = true; };
  }, [roadmapId, taskId, validationSuggested]);

  // Free-tier upgrade prompt only when the task suggests at least one
  // tool. Tasks with no suggested tools (generic to-do items) render
  // nothing here regardless of tier.
  const anyToolSuggested = (suggestedTools ?? []).some(
    t => t === 'conversation_coach'
      || t === 'outreach_composer'
      || t === 'research_tool'
      || t === 'service_packager'
      || t === 'validation',
  );

  if (tier === 'free') {
    if (!anyToolSuggested) return null;
    return <UpgradePrompt requiredTier="execute" variant="compact" />;
  }

  // Read-only ventures keep the prior tool-session reviews visible
  // (informational history) but hide the launcher chips. The
  // top-level banner already tells the founder why.
  if (!writable) {
    return (
      <>
        {coachSession    && <CoachSessionReview    session={coachSession} />}
        {composerSession && <ComposerSessionReview session={composerSession} />}
        {researchSession && <ResearchSessionReview session={researchSession} />}
        {packagerSession && <PackagerSessionReview session={packagerSession} />}
        {validationSession && <ValidationSessionReview session={validationSession} />}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-4">
      {anyToolSuggested && (
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Open with
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ConversationCoachButton suggestedTools={suggestedTools} taskId={taskId} roadmapId={roadmapId} />
        <OutreachComposerButton  suggestedTools={suggestedTools} taskId={taskId} roadmapId={roadmapId} />
        <ResearchToolButton      suggestedTools={suggestedTools} taskId={taskId} roadmapId={roadmapId} />
        <ServicePackagerButton   suggestedTools={suggestedTools} taskId={taskId} roadmapId={roadmapId} />
        <ValidationToolButton    suggestedTools={suggestedTools} taskId={taskId} roadmapId={roadmapId} />
      </div>

      {/* Session reviews render below the chip row when a prior
          session is persisted on this task — keeps the chip row
          tight while still surfacing the founder's output. */}
      {coachSession      && <CoachSessionReview      session={coachSession} />}
      {composerSession   && <ComposerSessionReview   session={composerSession} />}
      {researchSession   && <ResearchSessionReview   session={researchSession} />}
      {packagerSession   && <PackagerSessionReview   session={packagerSession} />}
      {validationSession && <ValidationSessionReview session={validationSession} />}
    </div>
  );
}
