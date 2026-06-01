'use client';
// src/app/(app)/discovery/roadmap/[id]/composer/OutreachComposerButton.tsx
//
// Hairline mono chip linking to the standalone Outreach Composer
// with the task + roadmap carried in the URL. See ConversationCoach-
// Button for the design notes — this is the same shape per-tool.

import Link from 'next/link';
import { Mail } from 'lucide-react';
// Import directly from constants, not the barrel — the barrel
// re-exports server-only engine modules that webpack traces.
import { COMPOSER_TOOL_ID } from '@/lib/roadmap/composer/constants';

export interface OutreachComposerButtonProps {
  suggestedTools?: string[];
  taskId:          string;
  roadmapId:       string;
}

export function OutreachComposerButton({
  suggestedTools,
  taskId,
  roadmapId,
}: OutreachComposerButtonProps) {
  if (!suggestedTools?.includes(COMPOSER_TOOL_ID)) return null;

  return (
    <Link
      href={`/tools/outreach-composer?task=${encodeURIComponent(taskId)}&roadmap=${encodeURIComponent(roadmapId)}`}
      className="inline-flex items-center gap-1.5 border border-rule-strong px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
    >
      <Mail aria-hidden="true" className="size-3 shrink-0 text-accent" />
      Outreach Composer
      <span aria-hidden="true">→</span>
    </Link>
  );
}
