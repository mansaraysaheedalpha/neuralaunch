'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchSessionReview.tsx
//
// Persistent collapsed view of a completed Research session on the task
// card. Shows the original query, findings count, and follow-up rounds.
// Expandable to re-read the summary and a finding count breakdown.

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Search } from 'lucide-react';
// Import directly from schemas, not the barrel.
import { safeParseResearchSession } from '@/lib/roadmap/research-tool/schemas';

export interface ResearchSessionReviewProps {
  /** The researchSession from the task, typed broadly so the caller
   *  can pass the raw JSON field without a cast. */
  session: Record<string, unknown>;
}

/**
 * ResearchSessionReview
 *
 * Renders the persistent summary of a completed Research session on the
 * task card. Collapsed by default. Expands to show the report summary
 * and a count breakdown of finding types.
 */
export function ResearchSessionReview({ session }: ResearchSessionReviewProps) {
  const [expanded, setExpanded] = useState(false);

  const parsed    = safeParseResearchSession(session);
  const query     = parsed?.query ?? (session.query as string | undefined) ?? 'Research session';
  const findings  = parsed?.report?.findings ?? [];
  const rounds    = parsed?.followUps?.length ?? 0;
  const summary   = parsed?.report?.summary;

  // Count findings by type for the breakdown
  const typeCounts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.type] = (acc[f.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setExpanded(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-start gap-2 min-w-0">
          <Search className="size-3.5 shrink-0 text-muted-foreground mt-0.5" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-[11px] font-semibold text-foreground truncate">
              Researched: {query}
            </p>
            <span className="text-[10px] text-muted-foreground">
              {findings.length} finding{findings.length !== 1 ? 's' : ''}
              {rounds > 0 ? ` · ${rounds} follow-up${rounds !== 1 ? 's' : ''}` : ''}
            </span>
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
            <div className="px-3 pb-3 border-t border-border flex flex-col gap-2">
              {summary && (
                <div className="pt-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Summary
                  </p>
                  <p className="text-[11px] text-foreground/90 leading-relaxed">
                    {summary}
                  </p>
                </div>
              )}

              {Object.keys(typeCounts).length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Findings by type
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(typeCounts).map(([type, count]) => (
                      <span
                        key={type}
                        className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5 capitalize"
                      >
                        {count} {type}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
