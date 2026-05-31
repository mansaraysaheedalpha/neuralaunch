'use client';
// src/app/(app)/discovery/no-idea/[sessionId]/Stage5Failure.tsx
//
// Failure surface for the Stage 5 worker. Renders the sanitised error
// message + retry CTA + revisit Stage 4 secondary action.
//
// Copy locked in docs/stage5-copy-review.md § D. The error message is
// already sanitised server-side (sanitiseErrorMessage in job.ts strips
// stack traces, caps at 500 chars).

import { Loader2, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Stage5FailureProps {
  errorMessage:    string;
  onRetry:         () => void;
  onRevisitStage4: () => void;
  retrying:        boolean;
}

export function Stage5Failure({
  errorMessage,
  onRetry,
  onRevisitStage4,
  retrying,
}: Stage5FailureProps) {
  return (
    <section className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-5 space-y-4">
      <h2 className="text-base font-semibold text-fg">
        Synthesis didn&apos;t finish
      </h2>

      <p className="text-sm text-fg">
        <span className="text-muted">What happened: </span>
        {errorMessage}
      </p>

      <div className="flex flex-wrap items-start gap-3 border-t border-accent/30 pt-4">
        <div className="flex flex-col items-start gap-1">
          <Button onClick={onRetry} disabled={retrying}>
            {retrying ? (
              <>
                <Loader2 className="size-4 mr-1 animate-spin" />
                Retrying…
              </>
            ) : (
              <>
                <RefreshCcw className="size-4 mr-1" />
                Try synthesis again
              </>
            )}
          </Button>
          <p className="text-xs text-muted">
            Synthesis costs are small. Retrying is the right first move.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1">
          <Button variant="ghost" onClick={onRevisitStage4} disabled={retrying}>
            Revisit Stage 4
          </Button>
          <p className="text-xs text-muted max-w-xs">
            If retrying keeps failing, the inputs might need a second look. Reopens Stage 4 for edits.
          </p>
        </div>
      </div>
    </section>
  );
}
