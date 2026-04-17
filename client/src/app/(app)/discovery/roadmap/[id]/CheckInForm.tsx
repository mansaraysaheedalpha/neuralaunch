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
                className="min-h-0 flex-1 resize-none py-2 text-xs"
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
