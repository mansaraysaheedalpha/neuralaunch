// src/components/discovery/QuestionStepper.tsx
'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, X } from 'lucide-react';
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

          {/* Question text */}
          <p className="text-sm text-foreground leading-relaxed mb-3 min-h-[2.5rem]">
            {currentQuestion}
          </p>

          {/* Answer row */}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
