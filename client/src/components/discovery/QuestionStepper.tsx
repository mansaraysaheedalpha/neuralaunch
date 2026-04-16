// src/components/discovery/QuestionStepper.tsx
'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuestionStepperProps {
  /** Current question text streamed from the server */
  currentQuestion: string;
  /** 0-based index of the current question */
  currentIndex:    number;
  /** Called with the answer text when user submits */
  onAnswer:        (answer: string) => void;
  /** Called when user dismisses the stepper to answer in the main input */
  onDismiss:       () => void;
  /** Whether the stepper should be visible */
  isVisible:       boolean;
  /**
   * When set, the stepper renders a failure state with the retry icon
   * instead of the answer input. The kind drives the message copy.
   */
  failure?: {
    kind:    'pre_stream' | 'cut_stream';
    partial?: string;
  } | null;
  onRetry?: () => void;
}

/**
 * QuestionStepper
 *
 * Anchored panel above the input bar that guides the user through
 * the adaptive discovery interview one question at a time.
 * Answers are submitted per-turn via the existing streaming protocol —
 * no batch dispatch.
 */
export function QuestionStepper({
  currentQuestion,
  currentIndex,
  onAnswer,
  onDismiss,
  isVisible,
  failure = null,
  onRetry,
}: QuestionStepperProps) {
  const [answer,       setAnswer]       = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Clear and refocus when question advances
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswer('');
    textareaRef.current?.focus();
  }, [currentIndex]);

  const canSubmit = answer.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    onAnswer(answer.trim());
    setAnswer('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="question-stepper"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="border-t border-border bg-background px-4 pt-3 pb-2"
        >
          {/* Header row: label + question number + dismiss */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Discovery · Question {currentIndex + 1}
            </span>
            <button
              type="button"
              onClick={onDismiss}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss stepper"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Question text — partial content from a cut stream is rendered
              with reduced opacity so the founder can see what arrived
              before the failure. Pre-stream failures have no content
              to show, only the retry affordance. */}
          {failure ? (
            <div className="mb-3 flex flex-col gap-2">
              {failure.kind === 'cut_stream' && failure.partial && failure.partial.trim().length > 0 && (
                <p className="text-sm text-foreground/70 leading-relaxed whitespace-pre-wrap">
                  {failure.partial}
                </p>
              )}
              <div className="flex items-center gap-2 text-[11px] text-gold">
                {failure.kind === 'cut_stream' && failure.partial && failure.partial.trim().length > 0 ? (
                  <>
                    <span className="block h-px w-6 bg-gold/40" />
                    <span>Response was interrupted</span>
                  </>
                ) : (
                  <span className="text-red-600 dark:text-red-400">
                    Could not get a question. Tap retry to try again.
                  </span>
                )}
                <button
                  type="button"
                  onClick={onRetry}
                  aria-label="Retry question"
                  className="inline-flex items-center justify-center size-6 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                >
                  <RotateCcw className="size-3" />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground leading-relaxed mb-3 min-h-[2.5rem]">
              {currentQuestion}
            </p>
          )}

          {/* Answer row — hidden in the failure state because the
              founder cannot meaningfully answer a question that did
              not arrive. */}
          {!failure && (
            <>
              <div className="flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your answer…"
                  rows={1}
                  style={{ resize: 'none', overflow: 'hidden' }}
                  onInput={e => {
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    // Cap at ~3 lines (approx 72px), then scroll
                    el.style.height = `${Math.min(el.scrollHeight, 72)}px`;
                    if (el.scrollHeight > 72) el.style.overflow = 'auto';
                    else el.style.overflow = 'hidden';
                  }}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none py-1.5 min-h-[2rem]"
                />
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                  className={cn(
                    'flex-shrink-0 size-8 rounded-lg flex items-center justify-center transition-colors',
                    canSubmit
                      ? 'bg-muted text-foreground hover:bg-border'
                      : 'bg-muted text-muted-foreground cursor-not-allowed',
                  )}
                  aria-label="Next question"
                >
                  <ArrowRight className="size-4" />
                </button>
              </div>

              {/* Keyboard hint */}
              <p className="text-center text-xs text-muted-foreground/60 mt-2">
                Press Enter to continue · Shift+Enter for new line
              </p>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
