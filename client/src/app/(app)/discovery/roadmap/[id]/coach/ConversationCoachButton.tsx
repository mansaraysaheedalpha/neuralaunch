'use client';
// src/app/(app)/discovery/roadmap/[id]/coach/ConversationCoachButton.tsx
//
// Hairline mono chip linking to the standalone Conversation Coach
// with the task + roadmap carried in the URL. PR 16 converted the
// roadmap tool launchers from inline-modal triggers to Institute
// chip Links; ToolShell reads `?task=` + `?roadmap=` and renders the
// task strip + a precise back-link to /discovery/roadmap/{id}.
// Renders null when the task's suggestedTools doesn't include the
// coach, so callers render unconditionally.

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
// Import directly from constants, not the barrel — the barrel
// re-exports server-only engine modules that webpack traces.
import { COACH_TOOL_ID } from '@/lib/roadmap/coach/constants';

export interface ConversationCoachButtonProps {
  suggestedTools?: string[];
  taskId:          string;
  roadmapId:       string;
}

export function ConversationCoachButton({
  suggestedTools,
  taskId,
  roadmapId,
}: ConversationCoachButtonProps) {
  if (!suggestedTools?.includes(COACH_TOOL_ID)) return null;

  return (
    <Link
      href={`/tools/conversation-coach?task=${encodeURIComponent(taskId)}&roadmap=${encodeURIComponent(roadmapId)}`}
      className="inline-flex items-center gap-1.5 border border-rule-strong px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
    >
      <MessageSquare aria-hidden="true" className="size-3 shrink-0 text-accent" />
      Conversation Coach
      <span aria-hidden="true">→</span>
    </Link>
  );
}
