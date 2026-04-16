// src/components/discovery/MessageList.tsx
'use client';

import { AnimatePresence, motion } from 'motion/react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThinkingPanel } from './ThinkingPanel';

export interface ChatMessage {
  id:      string;
  role:    'user' | 'assistant';
  content: string;
}

interface MessageListProps {
  messages:        ChatMessage[];
  isLoading:       boolean;
  isSynthesizing:  boolean;
  synthesisError?: boolean;
  synthesisStep?:  string | null;
  onRetry?:        () => void;
  /**
   * When set, the most recent assistant bubble (or the trailing area
   * after the last user bubble for pre_stream failures) is decorated
   * with a cut-stream indicator and a retry icon. The handler fires
   * the same turn re-attempt that produced the failure.
   */
  turnError?:      {
    kind:    'pre_stream' | 'cut_stream';
    partial?: string;
    surface: 'stepper' | 'reflection' | 'message';
  } | null;
  onRetryTurn?:    () => void;
}

/**
 * MessageList
 *
 * Renders the scrollable chat message feed, typing indicator, and ThinkingPanel.
 * When turnError is present and applicable to a chat-surface failure
 * (reflection cut, generic message failure), surfaces an inline retry
 * affordance — a circular ↺ icon — anchored to the relevant bubble.
 */
export function MessageList({
  messages,
  isLoading,
  isSynthesizing,
  synthesisError,
  synthesisStep,
  onRetry,
  turnError,
  onRetryTurn,
}: MessageListProps) {
  // Whether the last assistant bubble (if any) should show a cut-stream
  // affordance. Only applies when the failure surface is the chat itself
  // (reflection or message), not the stepper.
  const showCutOnLastAssistant =
    turnError?.kind === 'cut_stream'
    && (turnError.surface === 'reflection' || turnError.surface === 'message');

  // Whether to render a standalone retry affordance below the last
  // user bubble (pre_stream failure with no assistant content).
  const showStandaloneRetry =
    turnError?.kind === 'pre_stream'
    && (turnError.surface === 'reflection' || turnError.surface === 'message');

  // Index of the last assistant message (used for the cut indicator)
  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  })();

  return (
    <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-4 px-4">
      <AnimatePresence initial={false}>
        {messages.filter(m => m.content.trim()).map((msg, i, visibleArr) => {
          const isLastAssistant = msg.role === 'assistant'
            && messages[lastAssistantIdx]?.id === msg.id;
          const isCutStreamHere  = showCutOnLastAssistant && isLastAssistant;
          const isLastInList     = i === visibleArr.length - 1;

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={cn(
                'flex flex-col gap-2 max-w-[85%] break-words',
                msg.role === 'user' ? 'ml-auto items-end' : 'items-start',
              )}
            >
              <div
                className={cn(
                  'rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : isCutStreamHere
                      ? 'bg-muted text-foreground/80 border border-gold/30'
                      : 'bg-muted text-foreground',
                )}
              >
                {msg.content}
              </div>

              {/* Cut-stream indicator anchored to the trimmed assistant bubble */}
              {isCutStreamHere && (
                <div className="flex items-center gap-2 text-[11px] text-gold">
                  <span className="block h-px w-6 bg-gold/40" />
                  <span>Response was interrupted</span>
                  <RetryIconButton onClick={onRetryTurn} label="Retry message" />
                </div>
              )}

              {/* Standalone pre-stream retry below the last user bubble */}
              {showStandaloneRetry && msg.role === 'user' && isLastInList && (
                <div className="flex items-center gap-2 text-[11px] text-red-600 dark:text-red-400">
                  <span>Could not get a response</span>
                  <RetryIconButton onClick={onRetryTurn} label="Retry message" />
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {isLoading && !isSynthesizing && (
        <div className="flex gap-1.5 items-center px-4 py-3 bg-muted rounded-2xl w-fit">
          {[0, 1, 2].map(i => (
            <motion.span
              key={i}
              className="size-1.5 bg-muted-foreground rounded-full"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      )}

      <ThinkingPanel isVisible={isSynthesizing || !!synthesisError} synthesisError={synthesisError} synthesisStep={synthesisStep} onRetry={onRetry} />
    </div>
  );
}

/**
 * RetryIconButton
 *
 * The shared circular ↺ affordance used by both the chat surface and
 * the question stepper. Always visible (not on hover) so mobile
 * visitors can tap it. Matches existing icon-button sizing.
 */
function RetryIconButton({ onClick, label }: { onClick?: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center justify-center size-6 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
    >
      <RotateCcw className="size-3" />
    </button>
  );
}
