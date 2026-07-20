"use client";
// src/components/tool-jobs/ToolJobProgress.tsx
//
// Step-progress ladder rendered while a ToolJob is running. Mirrors
// the discovery synthesis flow's progress display so founders see
// the same pattern across the app. Six rows on the happy path:
// queued → context_loaded → researching → emitting → persisting →
// complete. The 'failed' state replaces the ladder with an error
// card and a Try-again button.

import { Loader2, Check } from "lucide-react";
import { ToolRecoveryNotice } from "@/components/institute/tools/ToolRecoveryNotice";
import {
  STAGE_LABELS,
  EMITTING_LABEL_BY_TOOL,
  TOOL_JOB_STAGE_ORDER,
  type ToolJobStage,
  type ToolJobType,
} from "@/lib/tool-jobs";
import { cn } from "@/lib/utils";

export interface ToolJobProgressProps {
  stage: ToolJobStage | null;
  errorMessage?: string | null;
  /** When provided and stage === 'failed', the founder sees a
   *  retry button that calls this. */
  onRetry?: () => void;
  /** Optional title shown above the ladder, e.g. "Running your
   *  research" or "Generating your service package". */
  title?: string;
  /** When provided, overrides the 'emitting' stage label with a
   *  per-tool variant from EMITTING_LABEL_BY_TOOL ("Building package"
   *  for the packager, "Drafting messages" for the composer, etc.). */
  toolType?: ToolJobType;
}

export function ToolJobProgress({
  stage,
  errorMessage,
  onRetry,
  title,
  toolType,
}: ToolJobProgressProps) {
  if (stage === "failed") {
    return (
      <ToolRecoveryNotice
        message={errorMessage ?? "The background job did not complete."}
        onRetry={onRetry}
        workPreserved="Your submitted inputs and last successfully saved result are preserved."
        leaveGuidance="It is safe to leave; this job has stopped and saved work remains in history."
        operationStatus="stopped"
        usageStatus="may_be_consumed"
      />
    );
  }

  const currentIndex = stage ? TOOL_JOB_STAGE_ORDER.indexOf(stage) : -1;

  return (
    <div
      className="rounded-xl border border-rule bg-bg p-4 flex flex-col gap-3"
      role="status"
      aria-live="polite"
      aria-busy={stage !== "complete"}
      aria-label={title ?? "Background job progress"}
    >
      {title && <p className="text-xs font-semibold text-fg">{title}</p>}
      <ol className="flex flex-col gap-1.5">
        {TOOL_JOB_STAGE_ORDER.map((s, i) => {
          const done = currentIndex > i;
          const active = currentIndex === i;
          const pending = currentIndex < i;
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                  done && "border-accent bg-accent/10 text-accent",
                  active && "border-accent bg-accent/10 text-accent",
                  pending && "border-rule/30 text-muted/50",
                )}
                aria-hidden
              >
                {done && <Check className="size-2.5" />}
                {active && <Loader2 className="size-2.5 animate-spin" />}
              </span>
              <span
                className={cn(
                  "text-[11px]",
                  done && "text-fg",
                  active && "text-fg font-medium",
                  pending && "text-muted/60",
                )}
              >
                {s === "emitting" && toolType
                  ? EMITTING_LABEL_BY_TOOL[toolType]
                  : STAGE_LABELS[s]}
              </span>
            </li>
          );
        })}
      </ol>
      <span className="sr-only">
        {stage === "complete"
          ? "Background work complete."
          : `Current stage: ${stage ? STAGE_LABELS[stage] : "starting"}.`}
      </span>
      <p className="text-[10px] text-muted/70 italic">
        You can leave this page — your work continues in the background and
        we&apos;ll send a notification when it&apos;s ready.
      </p>
    </div>
  );
}
