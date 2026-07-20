"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationRecoveryNotice } from "@/components/institute/tools/ConversationRecoveryNotice";
import type { RolePlayTurn } from "@/lib/roadmap/coach/schemas";
import {
  ROLEPLAY_HARD_CAP_TURNS,
  ROLEPLAY_WARNING_TURN,
} from "@/lib/roadmap/coach/constants";
import type { RolePlayChatProps } from "./coach-chat-types";
import { RehearsalInput } from "./RehearsalInput";
export type { RolePlayChatProps } from "./coach-chat-types";
export function RolePlayChat({
  roadmapId,
  taskId,
  otherPartyName,
  standalone,
  sessionId,
  onEnd,
  onToolCallComplete,
}: RolePlayChatProps) {
  const [history, setHistory] = useState<RolePlayTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const currentTurn = Math.ceil(history.length / 2) + (submitting ? 1 : 0);

  useEffect(() => {
    if (transcriptRef.current)
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [history, submitting]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || submitting || capped) return;
    const founderTurn: RolePlayTurn = {
      role: "founder",
      message,
      turn: Math.floor(history.length / 2) + 1,
    };
    setHistory((current) => [...current, founderTurn]);
    setDraft("");
    setSubmitting(true);
    setError(null);
    try {
      const url = standalone
        ? `/api/discovery/roadmaps/${roadmapId}/coach/roleplay`
        : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/coach/roleplay`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          standalone ? { message, sessionId } : { message, history },
        ),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(failure.error ?? "Could not send. Please try again.");
      }
      const data = (await response.json()) as {
        message: string;
        turn: number;
        capped: boolean;
      };
      if (data.capped) setCapped(true);
      else
        setHistory((current) => [
          ...current,
          { role: "other_party", message: data.message, turn: data.turn },
        ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Network error — please try again.",
      );
      setHistory((current) => current.slice(0, -1));
    } finally {
      setSubmitting(false);
      onToolCallComplete?.();
    }
  }, [
    capped,
    draft,
    history,
    onToolCallComplete,
    roadmapId,
    sessionId,
    standalone,
    submitting,
    taskId,
  ]);

  const remaining = Math.max(ROLEPLAY_HARD_CAP_TURNS - currentTurn + 1, 0);
  return (
    <section className="flex min-h-full flex-col gap-6 px-6 py-8 sm:px-10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">
            03 · Live rehearsal
          </p>
          <h2 className="mt-2 font-serif text-[24px] italic text-fg">
            Across the table: {otherPartyName}
          </h2>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
            Turn {Math.max(currentTurn, 1)} / {ROLEPLAY_HARD_CAP_TURNS}
          </p>
          <button
            type="button"
            onClick={onEnd}
            className="mt-2 font-mono text-[8px] uppercase tracking-[0.12em] text-fg hover:text-accent"
          >
            End and debrief →
          </button>
        </div>
      </header>
      <div
        ref={transcriptRef}
        className="max-h-[420px] min-h-[260px] overflow-y-auto border border-rule-strong"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label={`Rehearsal transcript with ${otherPartyName}`}
      >
        {history.length === 0 && (
          <p className="p-6 font-serif text-[17px] italic text-muted">
            Begin with the opening you would actually use.
          </p>
        )}
        {history.map((turn, index) => (
          <div
            key={`${turn.turn}-${turn.role}-${index}`}
            className={`grid gap-3 border-b border-rule px-5 py-4 last:border-b-0 sm:grid-cols-[100px_1fr] ${turn.role === "founder" ? "bg-accent/[0.04]" : ""}`}
          >
            <span
              className={`font-mono text-[8px] uppercase tracking-[0.14em] ${turn.role === "founder" ? "text-accent" : "text-muted"}`}
            >
              {turn.role === "founder" ? "You" : otherPartyName}
            </span>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg">
              {turn.message}
            </p>
          </div>
        ))}
        {submitting && (
          <p className="border-t border-rule px-5 py-3 font-mono text-[8px] uppercase tracking-[0.14em] text-accent">
            {otherPartyName} is responding…
          </p>
        )}
      </div>
      {currentTurn >= ROLEPLAY_WARNING_TURN && !capped && (
        <p className="border-l-2 border-accent bg-accent/[0.04] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-accent">
          {remaining} turns remain · move toward the ask
        </p>
      )}
      {error && (
        <ConversationRecoveryNotice message={error} context="coach_rehearsal" />
      )}
      {!capped ? (
        <RehearsalInput
          otherPartyName={otherPartyName}
          draft={draft}
          submitting={submitting}
          onChange={setDraft}
          onSend={() => void send()}
        />
      ) : (
        <button
          type="button"
          onClick={onEnd}
          className="bg-accent px-5 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-bg"
        >
          Rehearsal complete · open debrief →
        </button>
      )}
    </section>
  );
}
