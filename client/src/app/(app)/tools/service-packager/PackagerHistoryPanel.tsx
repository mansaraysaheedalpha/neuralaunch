"use client";
// src/app/(app)/tools/service-packager/PackagerHistoryPanel.tsx
//
// Recent-packages sidebar for the standalone Packager. Same pattern
// as Research / Composer / Coach history panels — without it, a
// founder who navigates away from /tools/service-packager via the
// Tools menu loses access to their generated packages because the
// URL no longer carries ?sessionId=.

import useSWR from "swr";
import { Loader2 } from "lucide-react";
import type { PackagerSessionListRow } from "@/app/api/discovery/roadmaps/[id]/packager/sessions/route";

export interface PackagerHistoryPanelProps {
  roadmapId: string;
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  refreshKey?: number;
}

interface SessionsListResponse {
  sessions: PackagerSessionListRow[];
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

export function PackagerHistoryPanel({
  roadmapId,
  activeSessionId,
  onSelect,
  refreshKey,
}: PackagerHistoryPanelProps) {
  const { data, error, isLoading, mutate } = useSWR<SessionsListResponse, Error>(
    `/api/discovery/roadmaps/${roadmapId}/packager/sessions?k=${refreshKey ?? ""}`,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border border-rule px-4 py-4">
        <Loader2 className="size-3.5 text-muted animate-spin" />
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
          Loading package ledger…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-rule px-4 py-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
          Package ledger unavailable
        </p>
        <button type="button" onClick={() => void mutate()} className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-fg underline underline-offset-4">
          Retry history
        </button>
      </div>
    );
  }

  const rows = data?.sessions ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="border border-rule-strong">
      <div className="flex items-center border-b border-rule px-4 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        <p>Package ledger</p>
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
                aria-label={`${isActive ? "Current package" : "Open package"}: ${row.serviceName || "unnamed service"}`}
                className={`group flex w-full flex-col gap-2 border-b border-rule px-4 py-3 text-left last:border-b-0 ${
                  isActive ? "bg-accent/[0.06]" : "hover:bg-bg-2"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="font-mono text-[9px] text-accent"
                  >
                    {isActive ? "●" : "○"}
                  </span>
                  <p className="line-clamp-2 flex-1 font-serif text-[15px] italic leading-snug text-fg">
                    {row.serviceName || "(unnamed service)"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-6 font-mono text-[8px] uppercase tracking-[0.1em] text-muted">
                  <span>{formatWhen(row.updatedAt)}</span>
                  <span>
                    · {row.tierCount} tier{row.tierCount === 1 ? "" : "s"}
                  </span>
                  {row.adjustmentRounds > 0 && (
                    <span>
                      · {row.adjustmentRounds} revision
                      {row.adjustmentRounds === 1 ? "" : "s"}
                    </span>
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
