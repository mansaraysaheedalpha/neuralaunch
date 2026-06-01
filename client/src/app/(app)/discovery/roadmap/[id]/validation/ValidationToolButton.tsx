'use client';
// src/app/(app)/discovery/roadmap/[id]/validation/ValidationToolButton.tsx
//
// Hairline mono chip linking to the standalone Validation Page tool
// with the task + roadmap carried in the URL.

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { VALIDATION_TOOL_ID } from '@/lib/roadmap/validation/constants';

export interface ValidationToolButtonProps {
  suggestedTools?: string[];
  taskId:          string;
  roadmapId:       string;
}

export function ValidationToolButton({
  suggestedTools,
  taskId,
  roadmapId,
}: ValidationToolButtonProps) {
  if (!suggestedTools?.includes(VALIDATION_TOOL_ID)) return null;

  return (
    <Link
      href={`/tools/validation?task=${encodeURIComponent(taskId)}&roadmap=${encodeURIComponent(roadmapId)}`}
      className="inline-flex items-center gap-1.5 border border-rule-strong px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
    >
      <ExternalLink aria-hidden="true" className="size-3 shrink-0 text-accent" />
      Validation Page
      <span aria-hidden="true">→</span>
    </Link>
  );
}
