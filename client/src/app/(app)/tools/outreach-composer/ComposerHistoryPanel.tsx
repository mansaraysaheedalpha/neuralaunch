'use client';
// src/app/(app)/tools/outreach-composer/ComposerHistoryPanel.tsx
//
// Recent-outreach sidebar for the standalone Composer page. Same
// pattern as ResearchHistoryPanel — without it, a founder who
// navigates away from the tool via the Tools menu loses access to
// their generated messages because the URL no longer carries
// ?sessionId=. The messages were never deleted; they were just
// unreachable.

import useSWR from 'swr';
import { Mail, History, Loader2 } from 'lucide-react';
import type { ComposerSessionListRow } from '@/app/api/discovery/roadmaps/[id]/composer/sessions/route';

export interface ComposerHistoryPanelProps {
  roadmapId:       string;
  activeSessionId: string | null;
  onSelect:        (sessionId: string) => void;
  refreshKey?:     number;
}

interface SessionsListResponse {
  sessions: ComposerSessionListRow[];
}

const fetcher = async (url: string): Promise<SessionsListResponse> => {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`sessions fetch failed: ${res.status}`);
  return (await res.json()) as SessionsListResponse;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7)  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString();
}

export function ComposerHistoryPanel({
  roadmapId,
  activeSessionId,
  onSelect,
  refreshKey,
}: ComposerHistoryPanelProps) {
  const { data, error, isLoading } = useSWR<SessionsListResponse, Error>(
    `/api/discovery/roadmaps/${roadmapId}/composer/sessions?k=${refreshKey ?? ''}`,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-background p-4 flex items-center gap-2">
        <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
        <span className="text-[11px] text-muted-foreground">Loading recent outreach…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-background p-4">
        <p className="text-[11px] text-red-500">Could not load recent outreach.</p>
      </div>
    );
  }

  const rows = data?.sessions ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-muted/30">
        <History className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-foreground">Recent outreach</p>
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
                  <Mail className={`size-3 shrink-0 mt-0.5 ${row.hasOutput ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="text-[11px] font-medium text-foreground line-clamp-2 flex-1">
                    {row.targetDescription || `(${row.channel} · ${row.mode})`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground pl-5">
                  <span>{formatWhen(row.updatedAt)}</span>
                  <span>• {row.channel}</span>
                  {row.hasOutput ? (
                    <span>• {row.messageCount} msg{row.messageCount === 1 ? '' : 's'}</span>
                  ) : (
                    <span>• draft</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
