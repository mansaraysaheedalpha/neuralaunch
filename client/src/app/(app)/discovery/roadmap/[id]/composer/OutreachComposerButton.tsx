'use client';
// src/app/(app)/discovery/roadmap/[id]/composer/OutreachComposerButton.tsx
//
// Renders a "Draft with Outreach Composer" entry point on a task card
// when the task's suggestedTools includes 'outreach_composer'.
// Returns null when the tool is not suggested, so callers can render
// unconditionally.

import { Mail } from 'lucide-react';
// Import directly from constants, not the barrel — the barrel
// re-exports server-only engine modules that webpack traces.
import { COMPOSER_TOOL_ID } from '@/lib/roadmap/composer/constants';

export interface OutreachComposerButtonProps {
  suggestedTools?: string[];
  onOpen:          () => void;
}

/**
 * OutreachComposerButton
 *
 * Conditional entry-point for the Outreach Composer. Renders only
 * when `suggestedTools` includes `outreach_composer`. Delegates the
 * open action to the parent via `onOpen` so the parent controls
 * whether to mount the flow inline or in a modal.
 */
export function OutreachComposerButton({
  suggestedTools,
  onOpen,
}: OutreachComposerButtonProps) {
  if (!suggestedTools?.includes(COMPOSER_TOOL_ID)) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
    >
      <Mail className="size-3 shrink-0" />
      Draft with Outreach Composer →
    </button>
  );
}
