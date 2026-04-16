'use client';
// src/app/(app)/discovery/roadmap/[id]/packager/PackagerSessionReview.tsx
//
// Collapsed summary of a completed Packager session on the task card.
// Shows service name, pricing range, adjustment count. Expandable to
// re-read the full package and brief.

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Package } from 'lucide-react';
import type { PackagerSession } from '@/lib/roadmap/service-packager/schemas';
import { ServicePackageView } from './ServicePackageView';

export interface PackagerSessionReviewProps {
  /** The packagerSession from the task, typed broadly so the caller
   *  can pass the raw JSON field without a cast. */
  session: Record<string, unknown>;
}

/**
 * PackagerSessionReview
 *
 * Persistent summary on the task card. Collapsed by default; expands
 * to the full ServicePackageView so the founder can re-read the brief
 * and tiers anytime.
 */
export function PackagerSessionReview({ session }: PackagerSessionReviewProps) {
  const [expanded, setExpanded] = useState(false);

  const typed     = session as Partial<PackagerSession>;
  const pkg       = typed.package;
  if (!pkg) return null;

  const tiers     = pkg.tiers ?? [];
  const adjCount  = typed.adjustments?.length ?? 0;
  const lowestTier  = tiers[0]?.price;
  const highestTier = tiers[tiers.length - 1]?.price;
  const priceRange =
    lowestTier && highestTier && lowestTier !== highestTier
      ? `${lowestTier} – ${highestTier}`
      : lowestTier ?? '—';

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Package className="size-3.5 text-primary shrink-0" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-[11px] font-semibold text-foreground truncate">
              {pkg.serviceName}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {tiers.length} tier{tiers.length === 1 ? '' : 's'} · {priceRange}
              {adjCount > 0 && ` · ${adjCount} adjustment${adjCount === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        </motion.span>
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-border pt-3">
              <ServicePackageView pkg={pkg} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
