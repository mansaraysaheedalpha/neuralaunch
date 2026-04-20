'use client';
// src/app/(app)/discovery/roadmap/[id]/validation/ValidationSessionReview.tsx
//
// Compact review card shown on a task once a validation page has
// been created from it. Mirrors the shape of the session-review
// cards for the four pre-existing tools but is simpler because
// validation has no transcript to summarise — just the slug,
// status, and a link to the full editor.

import Link from 'next/link';
import { ExternalLink, Archive } from 'lucide-react';

export interface ValidationSessionSummary {
  pageId: string;
  slug:   string;
  status: 'DRAFT' | 'LIVE' | 'ARCHIVED';
  /**
   * True when the roadmap's phases JSON no longer contains this
   * task's id — usually after a fork regeneration. We still render
   * the review so the user can reach the page via /tools/validation,
   * but the "Open editor" CTA is softened.
   */
  taskStale?: boolean;
}

const STATUS_CLASSES: Record<ValidationSessionSummary['status'], string> = {
  DRAFT:    'bg-gold/10 text-gold',
  LIVE:     'bg-success/10 text-success',
  ARCHIVED: 'bg-muted text-muted-foreground',
};

export function ValidationSessionReview({ session }: { session: ValidationSessionSummary }) {
  const statusLabel = session.status.charAt(0) + session.status.slice(1).toLowerCase();

  return (
    <div className="mt-2 flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-foreground">Validation page</p>
          <span className={`text-[9px] uppercase tracking-wider font-semibold rounded-full px-1.5 py-0.5 ${STATUS_CLASSES[session.status]}`}>
            {statusLabel}
          </span>
          {session.taskStale && (
            <span className="text-[9px] uppercase tracking-wider font-semibold rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground">
              <Archive className="inline size-2.5" aria-hidden="true" /> Task changed
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">/{session.slug}</p>
      </div>
      <Link
        href={`/discovery/validation/${session.pageId}`}
        className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
      >
        Open
        <ExternalLink className="size-3" aria-hidden="true" />
      </Link>
    </div>
  );
}
