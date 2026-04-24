'use client';
// src/components/tool-jobs/ToolJobProgress.tsx
//
// Step-progress ladder rendered while a ToolJob is running. Mirrors
// the discovery synthesis flow's progress display so founders see
// the same pattern across the app. Six rows on the happy path:
// queued → context_loaded → researching → emitting → persisting →
// complete. The 'failed' state replaces the ladder with an error
// card and a Try-again button.

import { Loader2, Check, AlertCircle } from 'lucide-react';
import {
  STAGE_LABELS,
  TOOL_JOB_STAGE_ORDER,
  type ToolJobStage,
} from '@/lib/tool-jobs';
import { cn } from '@/lib/utils';

export interface ToolJobProgressProps {
  stage:        ToolJobStage | null;
  errorMessage?: string | null;
  /** When provided and stage === 'failed', the founder sees a
   *  retry button that calls this. */
  onRetry?:     () => void;
  /** Optional title shown above the ladder, e.g. "Running your
   *  research" or "Generating your service package". */
  title?:       string;
}

export function ToolJobProgress({
  stage,
  errorMessage,
  onRetry,
  title,
}: ToolJobProgressProps) {
  if (stage === 'failed') {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground">Background work hit a snag</p>
            <p className="text-[11px] text-muted-foreground">
              {errorMessage ?? 'The job did not complete. You can try again.'}
            </p>
          </div>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="self-start rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  const currentIndex = stage
    ? TOOL_JOB_STAGE_ORDER.indexOf(stage)
    : -1;

  return (
    <div className="rounded-xl border border-border bg-background p-4 flex flex-col gap-3">
      {title && <p className="text-xs font-semibold text-foreground">{title}</p>}
      <ol className="flex flex-col gap-1.5">
        {TOOL_JOB_STAGE_ORDER.map((s, i) => {
          const done    = currentIndex > i;
          const active  = currentIndex === i;
          const pending = currentIndex < i;
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex size-4 shrink-0 items-center justify-center rounded-full border',
                  done    && 'border-primary bg-primary/10 text-primary',
                  active  && 'border-primary bg-primary/10 text-primary',
                  pending && 'border-muted-foreground/30 text-muted-foreground/50',
                )}
                aria-hidden
              >
                {done   && <Check className="size-2.5" />}
                {active && <Loader2 className="size-2.5 animate-spin" />}
              </span>
              <span
                className={cn(
                  'text-[11px]',
                  done    && 'text-foreground',
                  active  && 'text-foreground font-medium',
                  pending && 'text-muted-foreground/60',
                )}
              >
                {STAGE_LABELS[s]}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-[10px] text-muted-foreground/70 italic">
        You can leave this page — your work continues in the background and
        we&apos;ll send a notification when it&apos;s ready.
      </p>
    </div>
  );
}
