'use client';
// src/app/(app)/discovery/roadmap/[id]/coach/ConversationCoachButton.tsx
//
// Renders a "Prepare with Conversation Coach" entry point on a task
// card when the task's suggestedTools includes 'conversation_coach'.
// Returns null when the tool is not suggested, so callers can render
// unconditionally.

import { MessageSquare } from 'lucide-react';
import { COACH_TOOL_ID } from '@/lib/roadmap/coach';

export interface ConversationCoachButtonProps {
  suggestedTools?: string[];
  onOpen:         () => void;
}

/**
 * ConversationCoachButton
 *
 * Conditional entry-point for the Conversation Coach. Renders only
 * when `suggestedTools` includes `conversation_coach`. Delegates the
 * open action to the parent via `onOpen` so the parent controls
 * whether to mount the flow inline or in a modal.
 */
export function ConversationCoachButton({
  suggestedTools,
  onOpen,
}: ConversationCoachButtonProps) {
  if (!suggestedTools?.includes(COACH_TOOL_ID)) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
    >
      <MessageSquare className="size-3 shrink-0" />
      Prepare with Conversation Coach →
    </button>
  );
}
