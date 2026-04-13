'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchToolButton.tsx
//
// Renders a "Research this →" entry point on a task card when the
// task's suggestedTools includes 'research_tool'. Returns null when
// the tool is not suggested, so callers can render unconditionally.

import { Search } from 'lucide-react';
// Import directly from constants, not the barrel — the barrel
// re-exports server-only engine modules that webpack traces.
import { RESEARCH_TOOL_ID } from '@/lib/roadmap/research-tool/constants';

export interface ResearchToolButtonProps {
  suggestedTools?: string[];
  onOpen:          () => void;
}

/**
 * ResearchToolButton
 *
 * Conditional entry-point for the Research Tool. Renders only when
 * `suggestedTools` includes `research_tool`. Delegates the open action
 * to the parent via `onOpen` so the parent controls whether to mount
 * the flow inline or in a modal.
 */
export function ResearchToolButton({
  suggestedTools,
  onOpen,
}: ResearchToolButtonProps) {
  if (!suggestedTools?.includes(RESEARCH_TOOL_ID)) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
    >
      <Search className="size-3 shrink-0" />
      Research this →
    </button>
  );
}
