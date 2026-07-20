'use client';
// src/components/institute/tools/ToolShellStates.tsx
//
// Two transient body states that the standalone tool pages used to
// render OUTSIDE the ToolShell as bare grey panels (a Loader2 spinner
// or a small "needs a discovery session" message). PR 16 wraps both
// inside <ToolShell> so the founder always sees Institute chrome
// even mid-load. The shell props are passed through unchanged.

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { ToolShell, type ToolShellProps } from './ToolShell';
import { ToolRecoveryNotice } from './ToolRecoveryNotice';

type ToolShellSlot = Omit<ToolShellProps, 'children'>;

/**
 * Spinner state inside ToolShell. Identical chrome (crumb + header +
 * task strip when present) so the loading frame matches what the
 * loaded page will look like — no layout shift on resolve.
 */
export function ToolShellLoading(props: ToolShellSlot) {
  return (
    <ToolShell {...props}>
      <div className="flex items-center justify-center py-24">
        <Loader2 aria-hidden="true" className="size-6 text-accent animate-spin" />
      </div>
    </ToolShell>
  );
}

export function ToolShellLoadError(props: ToolShellSlot & { message: string }) {
  const { message, ...shell } = props;
  return (
    <ToolShell {...shell}>
      <ToolRecoveryNotice
        message={message}
        onRetry={() => window.location.reload()}
        retryLabel="Reload tool"
        workPreserved="No existing saved tool work was changed."
        leaveGuidance="It is safe to leave and return later."
        operationStatus="stopped"
        usageStatus="not_consumed"
      />
    </ToolShell>
  );
}

export interface ToolShellNoRoadmapProps extends ToolShellSlot {
  /**
   * Override the body copy — defaults to a generic "tool needs your
   * discovery context" sentence keyed off the tool name from the
   * Shell props.
   */
  message?: string;
}

/**
 * "Needs discovery context" empty state inside ToolShell. The tool
 * page early-returns this when the founder has never completed a
 * discovery session — there's no roadmap to anchor tool calls on.
 */
export function ToolShellNoRoadmap({
  message,
  ...shell
}: ToolShellNoRoadmapProps) {
  const copy = message ?? `${shell.toolName} needs your discovery context to produce useful outputs. Start a discovery session first.`;
  return (
    <ToolShell {...shell}>
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 py-16">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          No roadmap yet
        </span>
        <p className="text-[15px] leading-[1.6] text-fg-2">{copy}</p>
        <Link
          href="/discovery"
          className="inline-flex items-center gap-2 border-b border-accent pb-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent transition-opacity hover:opacity-80"
        >
          Start Discovery
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </ToolShell>
  );
}
