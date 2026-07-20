"use client";
// src/app/(app)/tools/conversation-coach/CoachHistoryPanel.tsx
//
// Recent-conversations sidebar for the standalone Coach page. Same
// pattern as ResearchHistoryPanel / ComposerHistoryPanel — without
// this, a founder who navigates away from the tool via the Tools
// menu loses access to their preparation, rehearsal, and debrief
// work because the URL no longer carries ?sessionId=. The data was
// never lost; it was just unreachable.

import useSWR from "swr";
import { Users, Loader2, Swords, CheckCircle2, BookOpen } from "lucide-react";
import type { CoachSessionListRow } from "@/app/api/discovery/roadmaps/[id]/coach/sessions/route";

export interface CoachHistoryPanelProps {
  roadmapId: string;
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  refreshKey?: number;
}

interface SessionsListResponse {
  sessions: CoachSessionListRow[];
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

/** Pick the farthest-along stage label so founders can see at a glance
 *  whether a past session ended at preparation, rehearsal, or debrief. */
function stageLabel(row: CoachSessionListRow): {
  icon: typeof Swords;
  text: string;
} {
  if (row.hasDebrief) return { icon: CheckCircle2, text: "debrief" };
  if (row.rolePlayTurns > 0)
    return {
      icon: Swords,
      text: `rehearsed · ${row.rolePlayTurns} turn${row.rolePlayTurns === 1 ? "" : "s"}`,
    };
  if (row.hasPreparation) return { icon: BookOpen, text: "prepared" };
  return { icon: Users, text: "setup" };
}

export function CoachHistoryPanel({
  roadmapId,
  activeSessionId,
  onSelect,
  refreshKey,
}: CoachHistoryPanelProps) {
  const { data, error, isLoading } = useSWR<SessionsListResponse, Error>(
    `/api/discovery/roadmaps/${roadmapId}/coach/sessions?k=${refreshKey ?? ""}`,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border border-rule p-4">
        <Loader2 className="size-3.5 text-muted animate-spin" />
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
          Loading rehearsal ledger…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-rule p-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
          Rehearsal ledger unavailable
        </p>
      </div>
    );
  }

  const rows = data?.sessions ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="border border-rule-strong">
      <div className="flex items-center border-b border-rule px-4 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
        <p>Rehearsal ledger</p>
        <span className="ml-auto text-accent">{rows.length} saved</span>
      </div>

      <ul>
        {rows.map((row) => {
          const isActive = row.id === activeSessionId;
          const stage = stageLabel(row);
          const StageIcon = stage.icon;
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                aria-current={isActive ? "true" : undefined}
                aria-label={`${isActive ? "Current rehearsal" : "Open rehearsal"}: ${row.who || "new conversation"}, ${stage.text}`}
                className={`flex w-full flex-col gap-2 border-b border-rule px-4 py-3 text-left last:border-b-0 ${
                  isActive ? "bg-accent/[0.06]" : "hover:bg-bg-2"
                }`}
              >
                <div className="flex items-start gap-2">
                  <StageIcon
                    aria-hidden="true"
                    className={`mt-0.5 size-3 shrink-0 ${row.hasDebrief ? "text-accent" : "text-muted"}`}
                  />
                  <p className="line-clamp-2 flex-1 font-serif text-[15px] italic leading-snug text-fg">
                    {row.who || "(new conversation)"}
                  </p>
                </div>
                <div className="flex items-center gap-2 pl-5 font-mono text-[8px] uppercase tracking-[0.1em] text-muted">
                  <span>{formatWhen(row.updatedAt)}</span>
                  <span>• {row.channel}</span>
                  <span>• {stage.text}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
