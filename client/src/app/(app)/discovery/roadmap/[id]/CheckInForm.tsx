'use client';
// src/app/(app)/discovery/roadmap/[id]/CheckInForm.tsx

import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';

const CHECKIN_CATEGORY_LABELS = {
  completed:  'Completed ✓',
  blocked:    'Blocked',
  unexpected: 'Something unexpected',
  question:   'I have a question',
} as const;

const CHECKIN_PLACEHOLDERS = {
  completed:  'Anything worth noting about how it went?',
  blocked:    'What specifically is blocking you?',
  unexpected: 'What happened that you did not expect?',
  question:   'What do you want to know?',
} as const;

export type CheckInCategory = keyof typeof CHECKIN_CATEGORY_LABELS;

export interface CheckInFormProps {
  open:        boolean;
  category:    CheckInCategory | null;
  freeText:    string;
  submitting:  boolean;
  error:       string | null;
  canSubmit:   boolean;
  onCategoryChange: (c: CheckInCategory) => void;
  onTextChange:     (s: string) => void;
  onSubmit:    () => void;
  onCancel:    () => void;
}

/**
 * CheckInForm — the in-card check-in surface.
 *
 * Pure presentation: every piece of state lives in the parent
 * (InteractiveTaskCard). This split exists because the form has
 * its own animation envelope and is conditionally rendered, which
 * was the largest single chunk of InteractiveTaskCard.
 */
export function CheckInForm({
  open,
  category,
  freeText,
  submitting,
  error,
  canSubmit,
  onCategoryChange,
  onTextChange,
  onSubmit,
  onCancel,
}: CheckInFormProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-2 pt-2 border-t border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              Check in on this task
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(CHECKIN_CATEGORY_LABELS) as CheckInCategory[]).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onCategoryChange(c)}
                  className={[
                    'rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors',
                    category === c
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-foreground/30',
                  ].join(' ')}
                >
                  {CHECKIN_CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            <textarea
              value={freeText}
              onChange={e => onTextChange(e.target.value)}
              placeholder={category ? CHECKIN_PLACEHOLDERS[category] : 'Pick a category above…'}
              disabled={!category || submitting}
              rows={3}
              className="resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-700 dark:text-red-400">
                {error}
              </div>
            )}
            <div className="flex items-center gap-2 self-end">
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="text-[11px] text-muted-foreground hover:text-foreground underline disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {submitting && <Loader2 className="size-3 animate-spin" />}
                {submitting ? 'Sending…' : 'Submit check-in'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
