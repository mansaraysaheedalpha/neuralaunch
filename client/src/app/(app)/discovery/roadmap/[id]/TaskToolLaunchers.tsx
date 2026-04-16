'use client';
// src/app/(app)/discovery/roadmap/[id]/TaskToolLaunchers.tsx
//
// Renders the four internal-tool launchers on a task card —
// Conversation Coach, Outreach Composer, Research Tool, Service
// Packager. Each is symmetric: a conditional button (visible only
// when suggestedTools includes the tool's id), a flow (the inline
// modal-ish panel), and a session-review summary that persists once
// the tool has been used. State for each tool's open/close lives
// here so the parent task card stays close to the 200-line cap.

import { useState } from 'react';
import type { StoredRoadmapTask } from '@/lib/roadmap/checkin-types';
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

export interface TaskToolLaunchersProps {
  roadmapId: string;
  taskId:    string;
  task:      StoredRoadmapTask;
}

export function TaskToolLaunchers({ roadmapId, taskId, task }: TaskToolLaunchersProps) {
  const [coachOpen,    setCoachOpen]    = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const [packagerOpen, setPackagerOpen] = useState(false);

  const suggestedTools = (task as { suggestedTools?: string[] }).suggestedTools;
  const coachSession    = (task as { coachSession?:    Record<string, unknown> }).coachSession;
  const composerSession = (task as { composerSession?: Record<string, unknown> }).composerSession;
  const researchSession = (task as { researchSession?: Record<string, unknown> }).researchSession;
  const packagerSession = (task as { packagerSession?: Record<string, unknown> }).packagerSession;

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
    </>
  );
}
