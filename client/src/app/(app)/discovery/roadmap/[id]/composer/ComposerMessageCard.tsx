"use client";

import { useCallback, useState } from "react";
import { MAX_REGENERATIONS_PER_MESSAGE } from "@/lib/roadmap/composer/constants";
import type { ComposerMessageCardProps } from "./composer-message-types";
export type { ComposerMessageCardProps } from "./composer-message-types";

const QUICK_PICKS = [
  "More casual",
  "Shorter",
  "Different opening",
  "More direct",
  "Less salesy",
];

export function ComposerMessageCard({
  message,
  roadmapId,
  sessionId,
  isSent,
  onMarkSent,
  onRegenerate,
  isRecommended,
}: ComposerMessageCardProps) {
  const [copied, setCopied] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const variationsUsed = message.variations?.length ?? 0;
  const canRegenerate = variationsUsed < MAX_REGENERATIONS_PER_MESSAGE;
  const latest = message.variations?.at(-1);
  const body = latest?.body ?? message.body;
  const subject = latest?.subject ?? message.subject;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        subject ? `Subject: ${subject}\n\n${body}` : body,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard support is optional. */
    }
  }, [body, subject]);

  function regenerate(request: string) {
    if (!request.trim() || !canRegenerate) return;
    onRegenerate(message.id, request.trim());
    setInstruction("");
    setRegenOpen(false);
  }

  return (
    <article className="border border-rule-strong">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-3">
        <div>
          {message.sendTiming && (
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
              {message.sendTiming}
            </p>
          )}
          <p className="font-serif text-[16px] italic text-fg">
            {subject
              ? `Subject · ${subject}`
              : (message.recipientPlaceholder ?? "Ready to send")}
          </p>
        </div>
        <div className="flex items-center gap-3 font-mono text-[8px] uppercase tracking-[0.14em]">
          {isRecommended && (
            <span className="text-accent">Recommended first</span>
          )}
          <span className={isSent ? "text-accent" : "text-muted"}>
            {isSent ? "● Sent" : "○ Draft"}
          </span>
        </div>
      </header>
      {message.personalisationHook && (
        <div className="border-b border-rule bg-accent/[0.04] px-5 py-3 text-[12px] text-fg-2">
          <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-accent">
            Personalise with
          </span>
          <span className="ml-3">{message.personalisationHook}</span>
        </div>
      )}
      <div className="px-5 py-6">
        <p className="whitespace-pre-wrap text-[14px] leading-[1.75] text-fg">
          {body}
        </p>
      </div>
      <aside className="grid gap-2 border-t border-rule bg-bg-2 px-5 py-4 sm:grid-cols-[110px_1fr]">
        <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
          Why it works
        </span>
        <p className="font-serif text-[14px] italic leading-relaxed text-fg-2">
          {message.annotation}
        </p>
        {message.escalationNote && (
          <>
            <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">
              Sequence logic
            </span>
            <p className="text-[12px] text-fg-2">{message.escalationNote}</p>
          </>
        )}
      </aside>
      {regenOpen && (
        <div
          id={`message-refinement-${message.id}`}
          className="border-t border-rule px-5 py-4"
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK_PICKS.map((pick) => (
              <button
                key={pick}
                type="button"
                onClick={() => regenerate(pick)}
                className="border border-rule px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-muted hover:border-accent hover:text-accent"
              >
                {pick}
              </button>
            ))}
          </div>
          <div className="flex border border-rule focus-within:border-accent">
            <label htmlFor={`message-angle-${message.id}`} className="sr-only">
              Instructions for a new message angle
            </label>
            <input
              id={`message-angle-${message.id}`}
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") regenerate(instruction);
              }}
              placeholder="Describe another angle…"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[12px] text-fg outline-none"
            />
            <button
              type="button"
              onClick={() => regenerate(instruction)}
              className="border-l border-rule px-3 font-mono text-[8px] uppercase text-accent"
            >
              Apply →
            </button>
          </div>
        </div>
      )}
      <footer className="grid grid-cols-2 items-center gap-2 border-t border-rule px-5 py-3 font-mono text-[8px] uppercase tracking-[0.12em] sm:flex sm:flex-wrap">
        <button
          type="button"
          onClick={() => {
            void copy();
          }}
          className="bg-accent px-3 py-2 text-bg"
          aria-live="polite"
        >
          {copied ? "Copied ✓" : "Copy message"}
        </button>
        <button
          type="button"
          onClick={() => setRegenOpen((open) => !open)}
          disabled={!canRegenerate}
          aria-expanded={regenOpen}
          aria-controls={`message-refinement-${message.id}`}
          className="border border-rule px-3 py-2 text-fg hover:border-accent hover:text-accent disabled:opacity-35"
        >
          New angle · {MAX_REGENERATIONS_PER_MESSAGE - variationsUsed} left
        </button>
        <button
          type="button"
          onClick={() => onMarkSent(message.id)}
          aria-pressed={isSent}
          className={`border px-3 py-2 ${isSent ? "border-accent text-accent" : "border-rule text-fg"}`}
        >
          {isSent ? "Marked sent" : "Mark as sent"}
        </button>
        {message.suggestedTool === "conversation_coach" && (
          <a
            href={
              sessionId
                ? `/tools/conversation-coach?fromComposer=${encodeURIComponent(sessionId)}&messageId=${encodeURIComponent(message.id)}&roadmapId=${encodeURIComponent(roadmapId)}`
                : "/tools/conversation-coach"
            }
            className="ml-auto text-accent"
          >
            Prepare conversation →
          </a>
        )}
      </footer>
    </article>
  );
}
