'use client';
// src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx
//
// Renders the five internal-tool launchers on a task card —
// Conversation Coach, Outreach Composer, Research Tool, Service
// Packager, and Validation Page. Each is symmetric: a conditional
// button (visible only when suggestedTools includes the tool's id),
// a flow (the inline modal-ish panel), and a session-review summary
// that persists once the tool has been used. State for each tool's
// open/close lives here so the parent task card stays close to the
// 200-line cap.
//
// Validation is the odd one out for session-storage reasons: the
// other four persist their output on the task JSON itself
// (coachSession, composerSession, etc.); validation persists as a
// separate ValidationPage row keyed on (roadmapId, taskId). To keep
// the rendering contract uniform we fetch the validation session
// lazily on mount when the tool is suggested on this task.

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type { StoredRoadmapTask } from '@/lib/roadmap/checkin-types';
import { UpgradePrompt } from '@/components/billing/UpgradePrompt';
import { ConversationCoachButton } from './coach/ConversationCoachButton';
import { CoachFlow }                from './coach/CoachFlow';
import { CoachSessionReview }       from './coach/CoachSessionReview';
import { OutreachComposerButton }   from './composer/OutreachComposerButton';
import { ComposerFlow }             from './composer/ComposerFlow';
import { ComposerSessionReview }    from './composer/ComposerSessionReview';
import { ResearchToolButton }       from './research/ResearchToolButton';
import { ResearchFlow }             from './research/ResearchFlow';
import { ResearchSessionReview }    from './research/ResearchSessionReview';
import { ServicePackagerButton }    from './packager/ServicePackagerButton';
import { PackagerFlow }             from './packager/PackagerFlow';
import { PackagerSessionReview }    from './packager/PackagerSessionReview';
import { ValidationToolButton }     from './validation/ValidationToolButton';
import { ValidationFlow }           from './validation/ValidationFlow';
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
  const [coachOpen,      setCoachOpen]      = useState(false);
  const [composerOpen,   setComposerOpen]   = useState(false);
  const [researchOpen,   setResearchOpen]   = useState(false);
  const [packagerOpen,   setPackagerOpen]   = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);

  const { data: session } = useSession();
  const tier = session?.user?.tier ?? 'free';

  const suggestedTools = (task as { suggestedTools?: string[] }).suggestedTools;
  const coachSession    = (task as { coachSession?:    Record<string, unknown> }).coachSession;
  const composerSession = (task as { composerSession?: Record<string, unknown> }).composerSession;
  const researchSession = (task as { researchSession?: Record<string, unknown> }).researchSession;
  const packagerSession = (task as { packagerSession?: Record<string, unknown> }).packagerSession;

  // Validation stores its state in a separate ValidationPage row
  // (not on task JSON), so we fetch lazily when the tool is suggested
  // on this task. null = not yet fetched; undefined = fetched, none
  // exists; else the summary.
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
        // Silent: the button still lets the user create a page.
        if (!cancelled) setValidationSession(undefined);
      }
    })();
    return () => { cancelled = true; };
    // Close-and-reopen reloads state via the flow's router.refresh().
    // Deliberately NOT depending on validationOpen so we don't thrash.
  }, [roadmapId, taskId, validationSuggested]);

  // Free-tier users see an upgrade prompt only when the task actually
  // suggests one or more of the five tools. Tasks with no suggested
  // tools (generic to-do items) render nothing here regardless of tier.
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

  return (
    <>
      {/* Conversation Coach */}
      <ConversationCoachButton suggestedTools={suggestedTools} onOpen={() => setCoachOpen(true)} />
      <CoachFlow roadmapId={roadmapId} taskId={taskId} open={coachOpen} onClose={() => setCoachOpen(false)} />
      {coachSession && !coachOpen && <CoachSessionReview session={coachSession} />}

      {/* Outreach Composer */}
      <OutreachComposerButton suggestedTools={suggestedTools} onOpen={() => setComposerOpen(true)} />
      <ComposerFlow roadmapId={roadmapId} taskId={taskId} open={composerOpen} onClose={() => setComposerOpen(false)} />
      {composerSession && !composerOpen && <ComposerSessionReview session={composerSession} />}

      {/* Research Tool */}
      <ResearchToolButton suggestedTools={suggestedTools} onOpen={() => setResearchOpen(true)} />
      <ResearchFlow roadmapId={roadmapId} taskId={taskId} open={researchOpen} onClose={() => setResearchOpen(false)} />
      {researchSession && !researchOpen && <ResearchSessionReview session={researchSession} />}

      {/* Service Packager */}
      <ServicePackagerButton suggestedTools={suggestedTools} onOpen={() => setPackagerOpen(true)} />
      <PackagerFlow roadmapId={roadmapId} taskId={taskId} open={packagerOpen} onClose={() => setPackagerOpen(false)} />
      {packagerSession && !packagerOpen && <PackagerSessionReview session={packagerSession} />}

      {/* Validation Page */}
      <ValidationToolButton suggestedTools={suggestedTools} onOpen={() => setValidationOpen(true)} />
      <ValidationFlow roadmapId={roadmapId} taskId={taskId} open={validationOpen} onClose={() => setValidationOpen(false)} />
      {validationSession && !validationOpen && <ValidationSessionReview session={validationSession} />}
    </>
  );
}
