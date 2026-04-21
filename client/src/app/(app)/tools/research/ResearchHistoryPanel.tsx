'use client';
// src/app/(app)/tools/research/ResearchHistoryPanel.tsx
//
// Recent-research sidebar for the standalone Research Tool page.
// Closes the product gap where completed reports lived on the
// roadmap row but were invisible to the founder — each /tools/research
// load started with a blank form, so a founder returning to read a
// report they'd already finished had no way to find it. Reports were
// not lost; they were just unreachable.
//
// Scope is standalone-only by design. Task-launched research lives on
// task.researchSession and is surfaced inside the roadmap viewer for
// that task. Mixing both into one list would confuse the founder
// about which session belongs where.

import useSWR from 'swr';
import { FileText, History, Loader2 } from 'lucide-react';
import type { ResearchSessionListRow } from '@/app/api/discovery/roadmaps/[id]/research/sessions/route';

export interface ResearchHistoryPanelProps {
  roadmapId:      string;
  activeSessionId: string | null;
  onSelect:       (sessionId: string) => void;
  /** Bumped whenever a new session completes so the list re-fetches. */
  refreshKey?:    number;
}

interface SessionsListResponse {
  sessions: ResearchSessionListRow[];
}

const fetcher = async (url: string): Promise<SessionsListResponse> => {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`sessions fetch failed: ${res.status}`);
  return (await res.json()) as SessionsListResponse;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)      return 'just now';
  if (diffMin < 60)     return `${diffMin} min ago`;
  const diffHr  = Math.floor(diffMin / 60);
  if (diffHr < 24)      return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7)      return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString();
}

export function ResearchHistoryPanel({
  roadmapId,
  activeSessionId,
  onSelect,
  refreshKey,
}: ResearchHistoryPanelProps) {
  // refreshKey bump changes the cache key so SWR re-fetches when the
  // page notifies that a new session just persisted.
  const { data, error, isLoading } = useSWR<SessionsListResponse, Error>(
    `/api/discovery/roadmaps/${roadmapId}/research/sessions?k=${refreshKey ?? ''}`,
    fetcher,
    {
      revalidateOnFocus:    false,
      revalidateIfStale:    true,
      shouldRetryOnError:   false,
    },
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-background p-4 flex items-center gap-2">
        <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
        <span className="text-[11px] text-muted-foreground">Loading recent research…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-background p-4">
        <p className="text-[11px] text-red-500">Could not load recent research.</p>
      </div>
    );
  }

  const rows = data?.sessions ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-muted/30">
        <History className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-foreground">Recent research</p>
        <span className="text-[10px] text-muted-foreground ml-auto">{rows.length}</span>
      </div>

      <ul className="divide-y divide-border">
        {rows.map(row => {
          const isActive = row.id === activeSessionId;
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                className={`w-full text-left px-4 py-3 flex flex-col gap-1 transition-colors ${
                  isActive ? 'bg-primary/5' : 'hover:bg-muted/40'
                }`}
              >
                <div className="flex items-start gap-2">
                  <FileText className={`size-3 shrink-0 mt-0.5 ${row.hasReport ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="text-[11px] font-medium text-foreground line-clamp-2 flex-1">
                    {row.query}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground pl-5">
                  <span>{formatWhen(row.updatedAt)}</span>
                  {row.hasReport && <span>• report</span>}
                  {row.followUpCount > 0 && (
                    <span>• {row.followUpCount} follow-up{row.followUpCount === 1 ? '' : 's'}</span>
                  )}
                  {!row.hasReport && <span>• draft</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
