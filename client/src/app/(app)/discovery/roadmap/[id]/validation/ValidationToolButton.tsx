'use client';
// src/app/(app)/discovery/roadmap/[id]/validation/ValidationToolButton.tsx
//
// Entry point on a task card when suggestedTools includes 'validation'.
// Mirrors the shape of ServicePackagerButton. Renders null when the
// tool isn't suggested so callers can render unconditionally.

import { ExternalLink } from 'lucide-react';
import { VALIDATION_TOOL_ID } from '@/lib/roadmap/validation/constants';

export interface ValidationToolButtonProps {
  suggestedTools?: string[];
  onOpen:          () => void;
}

export function ValidationToolButton({
  suggestedTools,
  onOpen,
}: ValidationToolButtonProps) {
  if (!suggestedTools?.includes(VALIDATION_TOOL_ID)) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/5 px-3 py-1.5 text-[11px] font-medium text-fg/85 hover:bg-accent/10 hover:text-fg transition-colors"
    >
      <ExternalLink className="size-3 shrink-0 text-accent" />
      Publish a validation page →
    </button>
  );
}
