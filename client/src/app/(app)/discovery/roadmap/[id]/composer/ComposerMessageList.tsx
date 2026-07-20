"use client";

import { useState } from "react";
import type { ComposerMessage, ComposerMode } from "@/lib/roadmap/composer";
import { ComposerMessageCard } from "./ComposerMessageCard";

export function ComposerMessageList({
  messages,
  mode,
  roadmapId,
  taskId,
  sessionId,
  sentIds,
  recommendedId,
  onMarkSent,
  onRegenerate,
}: {
  messages: ComposerMessage[];
  mode: ComposerMode;
  roadmapId: string;
  taskId: string;
  sessionId?: string;
  sentIds: Set<string>;
  recommendedId?: string;
  onMarkSent: (id: string) => void;
  onRegenerate: (id: string, instruction: string) => void;
}) {
  const [active, setActive] = useState(0);
  const paginated = mode === "batch" && messages.length > 1;
  const safeActive = Math.min(active, Math.max(messages.length - 1, 0));
  return (
    <div>
      {paginated && (
        <nav
          className="sticky top-0 z-10 mb-4 flex items-center justify-between border border-rule-strong bg-bg px-3 py-2 lg:hidden"
          aria-label="Batch message navigation"
        >
          <button
            type="button"
            onClick={() => setActive((value) => Math.max(0, value - 1))}
            disabled={safeActive === 0}
            className="px-3 py-2 font-mono text-[10px] uppercase text-fg disabled:opacity-40"
          >
            ← Previous
          </button>
          <span
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
            aria-live="polite"
          >
            Message {safeActive + 1} of {messages.length}
          </span>
          <button
            type="button"
            onClick={() =>
              setActive((value) => Math.min(messages.length - 1, value + 1))
            }
            disabled={safeActive === messages.length - 1}
            className="px-3 py-2 font-mono text-[10px] uppercase text-fg disabled:opacity-40"
          >
            Next →
          </button>
        </nav>
      )}
      <div
        className={
          paginated
            ? "lg:flex lg:max-h-[42rem] lg:flex-col lg:gap-5 lg:overflow-y-auto lg:pr-2"
            : "flex flex-col gap-5"
        }
      >
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={
              paginated && index !== safeActive ? "hidden lg:block" : "block"
            }
          >
            <ComposerMessageCard
              message={message}
              roadmapId={roadmapId}
              taskId={taskId}
              sessionId={sessionId}
              isSent={sentIds.has(message.id)}
              onMarkSent={onMarkSent}
              onRegenerate={onRegenerate}
              isRecommended={recommendedId === message.id}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
