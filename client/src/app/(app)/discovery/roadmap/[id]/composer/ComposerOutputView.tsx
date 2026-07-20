"use client";

import { useState, useCallback } from "react";
import type {
  ComposerOutput,
  ComposerMessage,
} from "@/lib/roadmap/composer/schemas";
import type {
  ComposerChannel,
  ComposerMode,
} from "@/lib/roadmap/composer/constants";
import { ComposerDispatchPlan } from "./ComposerDispatchPlan";
import { ComposerDecisionFooter } from "./ComposerDecisionFooter";
import { ComposerOutputHeader } from "./ComposerOutputHeader";
import { ComposerMessageList } from "./ComposerMessageList";

export interface ComposerOutputViewProps {
  output: ComposerOutput;
  channel: ComposerChannel;
  mode: ComposerMode;
  roadmapId: string;
  taskId: string;
  sessionId?: string;
  sentMessageIds?: string[];
  onDone: () => void;
  onToolCallComplete?: () => void;
}
export function ComposerOutputView({
  output,
  channel,
  mode,
  roadmapId,
  taskId,
  sessionId,
  sentMessageIds,
  onDone,
  onToolCallComplete,
}: ComposerOutputViewProps) {
  const [messages, setMessages] = useState<ComposerMessage[]>(output.messages);
  const [sentIds, setSentIds] = useState<Set<string>>(
    () => new Set(sentMessageIds ?? []),
  );
  const [regenErr, setRegenErr] = useState<string | null>(null);

  const standalone = Boolean(sessionId);
  const regenerateUrl = standalone
    ? `/api/discovery/roadmaps/${roadmapId}/composer/regenerate`
    : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/composer/regenerate`;
  const markSentUrl = standalone
    ? `/api/discovery/roadmaps/${roadmapId}/composer/mark-sent`
    : `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/composer/mark-sent`;

  const handleMarkSent = useCallback(
    async (id: string) => {
      if (sentIds.has(id)) return;
      setRegenErr(null);
      try {
        const response = await fetch(markSentUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            standalone ? { sessionId, messageId: id } : { messageId: id },
          ),
        });
        if (!response.ok) {
          const failure = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(failure.error ?? "Could not record the sent status.");
        }
        setSentIds((prev) => new Set([...prev, id]));
      } catch (cause) {
        setRegenErr(
          cause instanceof Error
            ? cause.message
            : "Could not record the sent status.",
        );
      }
    },
    [sentIds, markSentUrl, standalone, sessionId],
  );

  const handleRegenerate = useCallback(
    async (id: string, instruction: string) => {
      setRegenErr(null);
      try {
        const res = await fetch(regenerateUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            standalone
              ? { sessionId, messageId: id, instruction }
              : { messageId: id, instruction },
          ),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setRegenErr(json.error ?? "Could not regenerate. Please try again.");
          return;
        }
        const json = (await res.json()) as {
          variation: { body: string; subject?: string };
        };
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== id) return m;
            return {
              ...m,
              variations: [
                ...(m.variations ?? []),
                {
                  body: json.variation.body,
                  subject: json.variation.subject,
                  variationInstruction: instruction,
                },
              ],
            };
          }),
        );
      } catch {
        setRegenErr("Network error — please try again.");
      } finally {
        onToolCallComplete?.();
      }
    },
    [regenerateUrl, standalone, sessionId, onToolCallComplete],
  );

  const handleCopyAll = useCallback(async () => {
    const allText = messages.map((m) => m.body).join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(allText);
    } catch {
      /* unavailable */
    }
  }, [messages]);

  return (
    <section className="flex flex-col gap-6 px-6 py-8 sm:px-10">
      <ComposerOutputHeader
        mode={mode}
        channel={channel}
        messageCount={messages.length}
        error={regenErr}
        onCopyAll={() => void handleCopyAll()}
      />

      {output.dispatchPlan && (
        <ComposerDispatchPlan plan={output.dispatchPlan} />
      )}

      <ComposerMessageList
        messages={messages}
        mode={mode}
        roadmapId={roadmapId}
        taskId={taskId}
        sessionId={sessionId}
        sentIds={sentIds}
        recommendedId={output.dispatchPlan?.recommendedMessageId}
        onMarkSent={(id) => void handleMarkSent(id)}
        onRegenerate={(id, instruction) =>
          void handleRegenerate(id, instruction)
        }
      />

      {output.dispatchPlan && (
        <ComposerDecisionFooter plan={output.dispatchPlan} />
      )}

      <button
        type="button"
        onClick={onDone}
        className="self-start border border-rule px-4 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-fg hover:border-accent hover:text-accent"
      >
        Done
      </button>
    </section>
  );
}
