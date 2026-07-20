"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { VoiceInputButton } from "@/components/ui/VoiceInputButton";
import { ConversationRecoveryNotice } from "@/components/institute/tools/ConversationRecoveryNotice";
import { canUseVoiceMode, useVoiceTier } from "@/lib/voice/client-tier";
import { trackVoiceEvent } from "@/lib/voice/analytics";
import type {
  ComposerChannel,
  ComposerMode,
} from "@/lib/roadmap/composer/constants";
import type { OutreachContext } from "@/lib/roadmap/composer/schemas";
import type { ComposerContextChatProps } from "./composer-context-types";
export type { ComposerContextChatProps } from "./composer-context-types";

type ContextExchange = { role: "founder" | "agent"; message: string };

export function ComposerContextChat({
  roadmapId,
  taskId,
  standalone,
  initialDraft,
  onContextComplete,
  onCancel,
}: ComposerContextChatProps) {
  const [exchanges, setExchanges] = useState<ContextExchange[]>([]);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSentRef = useRef(false);
  const voiceEnabled = canUseVoiceMode(useVoiceTier());

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || submitting) return;
    setExchanges((current) => [...current, { role: "founder", message }]);
    setDraft("");
    setSubmitting(true);
    setError(null);
    try {
      const url = standalone
        ? `/api/discovery/roadmaps/${roadmapId}/composer/generate`
        : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/composer/generate`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(failure.error ?? "Could not send. Please try again.");
      }
      const data = (await response.json()) as {
        status: "gathering" | "ready";
        message: string;
        context?: OutreachContext;
        mode?: ComposerMode;
        channel?: ComposerChannel;
      };
      setExchanges((current) => [
        ...current,
        { role: "agent", message: data.message },
      ]);
      if (data.status === "ready" && data.context && data.mode && data.channel)
        onContextComplete(data.context, data.mode, data.channel);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Network error — please try again.",
      );
      setExchanges((current) => current.slice(0, -1));
    } finally {
      setSubmitting(false);
    }
  }, [draft, onContextComplete, roadmapId, standalone, submitting, taskId]);

  useEffect(() => {
    if (autoSentRef.current || !initialDraft?.trim()) return;
    autoSentRef.current = true;
    void send();
  }, [initialDraft, send]);

  return (
    <section className="flex min-h-full flex-col gap-7 px-6 py-8 sm:px-10">
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        <span>01 · Brief</span>
        <span className="text-accent">Interview</span>
      </div>
      <div>
        <h2 className="font-serif text-[25px] italic text-fg">
          Who needs to hear from you?
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-2">
          Name the audience, the relationship, and the response you need. The
          Composer will choose the appropriate message shape from the evidence.
        </p>
      </div>
      {exchanges.length > 0 && (
        <ol className="border border-rule-strong">
          {exchanges.map((exchange, index) => (
            <li
              key={`${exchange.role}-${index}`}
              className={`grid gap-2 border-b border-rule px-4 py-3 last:border-b-0 sm:grid-cols-[74px_1fr] ${exchange.role === "founder" ? "bg-accent/[0.04]" : ""}`}
            >
              <span
                className={`font-mono text-[8px] uppercase tracking-[0.14em] ${exchange.role === "founder" ? "text-accent" : "text-muted"}`}
              >
                {exchange.role === "founder" ? "You" : "Composer"}
              </span>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">
                {exchange.message}
              </p>
            </li>
          ))}
        </ol>
      )}
      <div className="border border-rule bg-bg-2 focus-within:border-accent">
        <textarea
          aria-label="Describe the outreach situation"
          aria-describedby="composer-context-help"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Who are you reaching out to, and what should happen next?"
          disabled={submitting}
          className="min-h-[130px] w-full resize-none bg-transparent p-5 font-serif text-[20px] italic leading-relaxed text-fg outline-none placeholder:text-muted-2 disabled:opacity-50"
        />
        <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-rule bg-bg-2 px-4 py-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] lg:static">
          <span
            id="composer-context-help"
            className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted"
          >
            Control or Command plus Enter sends
          </span>
          <div className="flex items-center gap-2">
            {voiceEnabled && (
              <VoiceInputButton
                onTranscription={(text) => {
                  setDraft((current) =>
                    current ? `${current} ${text}` : text,
                  );
                  trackVoiceEvent("voice_transcribed", { surface: "composer" });
                }}
                onError={(message) => {
                  trackVoiceEvent("voice_error", {
                    surface: "composer",
                    errorMessage: message,
                  });
                  toast.error(message);
                }}
                disabled={submitting}
              />
            )}
            <button
              type="button"
              onClick={() => {
                void send();
              }}
              disabled={!draft.trim() || submitting}
              className="bg-accent px-5 py-3 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-bg disabled:opacity-35"
            >
              {submitting ? "Reading…" : "Continue →"}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <ConversationRecoveryNotice
          message={error}
          context="composer_context"
        />
      )}
      <button
        type="button"
        onClick={onCancel}
        className="self-start font-mono text-[9px] uppercase tracking-[0.14em] text-muted hover:text-accent"
      >
        Cancel session
      </button>
    </section>
  );
}
