'use client';
// src/components/tool-jobs/BackgroundJobsBanner.tsx
//
// Floating card at the bottom-right of every authenticated page that
// surfaces in-flight ToolJob rows. The point: a founder who runs a
// long Research call and then navigates to Validation should still
// see "your research is running" and know roughly where it is —
// without bouncing back to the tool page.
//
// Auto-hides when there are no active jobs. Up to 3 rows shown
// inline, with a "+N more" if the founder somehow has more in
// flight (the API caps at 10).

import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Sparkles } from 'lucide-react';
import {
  STAGE_LABELS,
  EMITTING_LABEL_BY_TOOL,
  TOOL_DISPLAY_LABELS,
  type ToolJobStage,
  type ToolJobType,
} from '@/lib/tool-jobs';
import { useActiveJobs, type ActiveToolJob } from '@/lib/tool-jobs/use-active-jobs';
import { cn } from '@/lib/utils';

const VISIBLE_ROWS = 3;

function rowLabel(job: ActiveToolJob): string {
  const stage = job.stage as ToolJobStage;
  if (stage === 'emitting') return EMITTING_LABEL_BY_TOOL[job.toolType as ToolJobType];
  return STAGE_LABELS[stage];
}

export function BackgroundJobsBanner() {
  const { jobs } = useActiveJobs();

  // Filter: only render rows actually in-flight (defensive — the
  // endpoint already excludes terminal stages, but a stale poll could
  // briefly contain a freshly-completed row).
  const activeJobs = jobs.filter(j => j.stage !== 'complete' && j.stage !== 'failed');

  return (
    <AnimatePresence>
      {activeJobs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'fixed bottom-4 right-4 z-40',
            'w-72 max-w-[calc(100vw-2rem)]',
            'rounded-xl border border-border bg-background shadow-lg',
            'p-3 flex flex-col gap-2',
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary shrink-0" />
            <p className="text-xs font-semibold text-foreground">
              {activeJobs.length === 1
                ? '1 background job running'
                : `${activeJobs.length} background jobs running`}
            </p>
          </div>

          <ul className="flex flex-col gap-1.5">
            {activeJobs.slice(0, VISIBLE_ROWS).map(job => (
              <li
                key={job.id}
                className="flex items-center gap-2 text-[11px]"
              >
                <Loader2 className="size-3 animate-spin text-primary shrink-0" />
                <span className="text-foreground font-medium capitalize truncate">
                  {TOOL_DISPLAY_LABELS[job.toolType as ToolJobType]}
                </span>
                <span className="text-muted-foreground/70 truncate">
                  · {rowLabel(job)}
                </span>
              </li>
            ))}
            {activeJobs.length > VISIBLE_ROWS && (
              <li className="text-[10px] text-muted-foreground/60 pl-5">
                +{activeJobs.length - VISIBLE_ROWS} more
              </li>
            )}
          </ul>

          <p className="text-[10px] text-muted-foreground/70 italic">
            We&apos;ll send a notification when each one is ready.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
