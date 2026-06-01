'use client';
// src/app/(app)/discovery/roadmap/[id]/CheckInForm.tsx

import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { VoiceInputButton } from '@/components/ui/VoiceInputButton';
import { canUseVoiceMode, useVoiceTier } from '@/lib/voice/client-tier';
import { trackVoiceEvent } from '@/lib/voice/analytics';
import { suggestCheckInCategory } from '@/lib/voice/checkin-category';

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
  /**
   * A12: when set, overrides the per-category placeholder. Used by
   * the two-option completion flow to surface a more specific prompt
   * ("What happened when you did this? Did it match what you
   * expected?") when the founder explicitly picked "Tell us how it
   * went". null means use the default per-category placeholder.
   */
  placeholderOverride?: string | null;
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
  placeholderOverride,
  onCategoryChange,
  onTextChange,
  onSubmit,
  onCancel,
}: CheckInFormProps) {
  const voiceTier    = useVoiceTier();
  const voiceEnabled = canUseVoiceMode(voiceTier);

  const handleVoiceTranscription = (text: string) => {
    if (!text.trim()) return;
    onTextChange(freeText.trim().length > 0 ? `${freeText.trim()} ${text}` : text);
    trackVoiceEvent('voice_transcribed', { surface: 'checkin' });
    // Auto-suggest category from keywords when the founder has not
    // chosen one yet. Never overwrite an explicit selection.
    if (!category) {
      const suggestion = suggestCheckInCategory(text);
      if (suggestion) onCategoryChange(suggestion);
    }
  };

  const handleVoiceError = (message: string) => {
    trackVoiceEvent('voice_error', { surface: 'checkin', errorMessage: message });
    toast.error(message);
  };

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
          <div className="flex flex-col gap-3 border-t border-rule pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Check in · this task
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CHECKIN_CATEGORY_LABELS) as CheckInCategory[]).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onCategoryChange(c)}
                  className={[
                    'border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors',
                    category === c
                      ? 'border-accent bg-accent text-bg'
                      : 'border-rule text-fg-2 hover:border-accent hover:text-accent',
                  ].join(' ')}
                >
                  {CHECKIN_CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            <div className="flex items-start gap-2">
              <Textarea
                value={freeText}
                onChange={e => onTextChange(e.target.value)}
                placeholder={
                  placeholderOverride ??
                  (category ? CHECKIN_PLACEHOLDERS[category] : 'Pick a category above…')
                }
                disabled={!category || submitting}
                rows={3}
                className="min-h-0 flex-1 resize-none rounded-none border border-rule bg-bg py-2 text-[14px] text-fg placeholder:text-muted focus-visible:border-accent focus-visible:ring-0"
              />
              {voiceEnabled && (
                <VoiceInputButton
                  onTranscription={handleVoiceTranscription}
                  onError={handleVoiceError}
                  disabled={submitting}
                  className="shrink-0"
                />
              )}
            </div>
            {error && (
              <p className="border-l-2 border-amber bg-bg-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-amber">
                {error}
              </p>
            )}
            <div className="flex items-center gap-3 self-end">
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted underline underline-offset-2 transition-colors hover:text-fg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 bg-accent px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0"
              >
                {submitting && <Loader2 aria-hidden="true" className="size-3 animate-spin" />}
                {submitting ? 'Sending…' : 'Submit check-in'}
                {!submitting && <span aria-hidden="true">→</span>}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
