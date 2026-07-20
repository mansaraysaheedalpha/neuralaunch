"use client";
// src/app/(app)/tools/outreach-composer/ComposerHistoryPanel.tsx
//
// Recent-outreach sidebar for the standalone Composer page. Same
// pattern as ResearchHistoryPanel — without it, a founder who
// navigates away from the tool via the Tools menu loses access to
// their generated messages because the URL no longer carries
// ?sessionId=. The messages were never deleted; they were just
// unreachable.

import useSWR from "swr";
import { Loader2 } from "lucide-react";
import type { ComposerSessionListRow } from "@/app/api/discovery/roadmaps/[id]/composer/sessions/route";

export interface ComposerHistoryPanelProps {
  roadmapId: string;
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  refreshKey?: number;
}

interface SessionsListResponse {
  sessions: ComposerSessionListRow[];
}

const fetcher = async (url: string): Promise<SessionsListResponse> => {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`sessions fetch failed: ${res.status}`);
  return (await res.json()) as SessionsListResponse;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

export function ComposerHistoryPanel({
  roadmapId,
  activeSessionId,
  onSelect,
  refreshKey,
}: ComposerHistoryPanelProps) {
  const { data, error, isLoading } = useSWR<SessionsListResponse, Error>(
    `/api/discovery/roadmaps/${roadmapId}/composer/sessions?k=${refreshKey ?? ""}`,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border border-rule p-4">
        <Loader2 className="size-3.5 text-muted animate-spin" />
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
          Loading dispatch ledger…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-rule p-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
          Dispatch ledger unavailable
        </p>
      </div>
    );
  }

  const rows = data?.sessions ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="border border-rule-strong">
      <div className="flex items-center border-b border-rule px-4 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        <p>Dispatch ledger</p>
        <span className="ml-auto text-accent">{rows.length} saved</span>
      </div>

      <ul>
        {rows.map((row) => {
          const isActive = row.id === activeSessionId;
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                aria-current={isActive ? "true" : undefined}
                aria-label={`${isActive ? "Current outreach" : "Open outreach"}: ${row.targetDescription || `${row.channel} ${row.mode}`}`}
                className={`flex w-full flex-col gap-2 border-b border-rule px-4 py-3 text-left last:border-b-0 ${
                  isActive ? "bg-accent/[0.06]" : "hover:bg-bg-2"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`font-mono text-[9px] ${row.hasOutput ? "text-accent" : "text-muted"}`}
                  >
                    {isActive ? "●" : "○"}
                  </span>
                  <p className="line-clamp-2 flex-1 font-serif text-[15px] italic leading-snug text-fg">
                    {row.targetDescription || `(${row.channel} · ${row.mode})`}
                  </p>
                </div>
                <div className="flex items-center gap-2 pl-6 font-mono text-[8px] uppercase tracking-[0.1em] text-muted">
                  <span>{formatWhen(row.updatedAt)}</span>
                  <span>· {row.channel}</span>
                  {row.hasOutput ? (
                    <span>
                      · {row.messageCount} msg
                      {row.messageCount === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span>· draft</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
