'use client';
// src/app/(app)/discovery/roadmap/[id]/packager/ServicePackagerButton.tsx
//
// Hairline mono chip linking to the standalone Service Packager with
// the task + roadmap carried in the URL.

import Link from 'next/link';
import { Package } from 'lucide-react';
// Import directly from constants, not the barrel — the barrel
// re-exports server-only engine modules that webpack traces.
import { PACKAGER_TOOL_ID } from '@/lib/roadmap/service-packager/constants';

export interface ServicePackagerButtonProps {
  suggestedTools?: string[];
  taskId:          string;
  roadmapId:       string;
}

export function ServicePackagerButton({
  suggestedTools,
  taskId,
  roadmapId,
}: ServicePackagerButtonProps) {
  if (!suggestedTools?.includes(PACKAGER_TOOL_ID)) return null;

  return (
    <Link
      href={`/tools/service-packager?task=${encodeURIComponent(taskId)}&roadmap=${encodeURIComponent(roadmapId)}`}
      className="inline-flex items-center gap-1.5 border border-rule-strong px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
    >
      <Package aria-hidden="true" className="size-3 shrink-0 text-accent" />
      Service Packager
      <span aria-hidden="true">→</span>
    </Link>
  );
}
