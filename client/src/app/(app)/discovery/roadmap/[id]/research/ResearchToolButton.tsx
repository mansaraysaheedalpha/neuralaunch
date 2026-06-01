'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchToolButton.tsx
//
// Hairline mono chip linking to the standalone Research Tool with
// the task + roadmap carried in the URL.

import Link from 'next/link';
import { Search } from 'lucide-react';
// Import directly from constants, not the barrel — the barrel
// re-exports server-only engine modules that webpack traces.
import { RESEARCH_TOOL_ID } from '@/lib/roadmap/research-tool/constants';

export interface ResearchToolButtonProps {
  suggestedTools?: string[];
  taskId:          string;
  roadmapId:       string;
}

export function ResearchToolButton({
  suggestedTools,
  taskId,
  roadmapId,
}: ResearchToolButtonProps) {
  if (!suggestedTools?.includes(RESEARCH_TOOL_ID)) return null;

  return (
    <Link
      href={`/tools/research?task=${encodeURIComponent(taskId)}&roadmap=${encodeURIComponent(roadmapId)}`}
      className="inline-flex items-center gap-1.5 border border-rule-strong px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
    >
      <Search aria-hidden="true" className="size-3 shrink-0 text-accent" />
      Research Tool
      <span aria-hidden="true">→</span>
    </Link>
  );
}
