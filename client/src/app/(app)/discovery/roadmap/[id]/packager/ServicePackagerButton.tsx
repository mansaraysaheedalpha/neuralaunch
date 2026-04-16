'use client';
// src/app/(app)/discovery/roadmap/[id]/packager/ServicePackagerButton.tsx
//
// Renders a "Package your service" entry point on a task card when the
// task's suggestedTools includes 'service_packager'. Returns null when
// the tool is not suggested, so callers can render unconditionally.

import { Package } from 'lucide-react';
// Import directly from constants, not the barrel — the barrel
// re-exports server-only engine modules that webpack traces.
import { PACKAGER_TOOL_ID } from '@/lib/roadmap/service-packager/constants';

export interface ServicePackagerButtonProps {
  suggestedTools?: string[];
  onOpen:          () => void;
}

/**
 * ServicePackagerButton
 *
 * Conditional entry-point for the Service Packager. Renders only when
 * `suggestedTools` includes `service_packager`. Delegates the open
 * action to the parent via `onOpen` so the parent controls whether
 * to mount the flow inline or in a modal.
 */
export function ServicePackagerButton({
  suggestedTools,
  onOpen,
}: ServicePackagerButtonProps) {
  if (!suggestedTools?.includes(PACKAGER_TOOL_ID)) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
    >
      <Package className="size-3 shrink-0" />
      Package your service →
    </button>
  );
}
