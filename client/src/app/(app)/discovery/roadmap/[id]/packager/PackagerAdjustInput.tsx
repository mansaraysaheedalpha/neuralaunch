'use client';
// src/app/(app)/discovery/roadmap/[id]/packager/PackagerAdjustInput.tsx
//
// Inline adjustment input shown below the package. Shows a round
// counter ("1/3 adjustments used") and disables itself once the
// adjustment cap is reached.

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { VoiceInputButton } from '@/components/ui/VoiceInputButton';
import { canUseVoiceMode, useVoiceTier } from '@/lib/voice/client-tier';
import { trackVoiceEvent } from '@/lib/voice/analytics';
import { MAX_ADJUSTMENT_ROUNDS } from '@/lib/roadmap/service-packager/constants';

export interface PackagerAdjustInputProps {
  adjustmentsUsed: number;
  pending:         boolean;
  onAdjust:        (request: string) => void;
}

/**
 * PackagerAdjustInput
 *
 * Renders the "Want to adjust anything?" input + send button.
 * Disabled state once MAX_ADJUSTMENT_ROUNDS is reached so the founder
 * can see they've used all their refinements.
 */
export function PackagerAdjustInput({
  adjustmentsUsed, pending, onAdjust,
}: PackagerAdjustInputProps) {
  const [draft, setDraft] = useState('');
  const exhausted = adjustmentsUsed >= MAX_ADJUSTMENT_ROUNDS;

  const voiceTier    = useVoiceTier();
  const voiceEnabled = canUseVoiceMode(voiceTier);

  const handleVoiceTranscription = (text: string) => {
    if (!text.trim()) return;
    setDraft(prev => prev.trim().length > 0 ? `${prev.trim()} ${text}` : text);
    trackVoiceEvent('voice_transcribed', { surface: 'packager' });
  };

  const handleVoiceError = (message: string) => {
    trackVoiceEvent('voice_error', { surface: 'packager', errorMessage: message });
    toast.error(message);
  };

  function handleSend() {
    const text = draft.trim();
    if (!text || exhausted) return;
    onAdjust(text);
    setDraft('');
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">Want to adjust anything?</p>
        <p className="text-[10px] text-muted-foreground">
          {adjustmentsUsed}/{MAX_ADJUSTMENT_ROUNDS} adjustments used
        </p>
      </div>
      <div className="flex items-start gap-2">
        <Textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={2}
          placeholder={exhausted
            ? 'You\'ve used all three adjustments on this package.'
            : 'e.g. "make the premium tier include emergency same-day service"'}
          disabled={pending || exhausted}
          className="min-h-0 flex-1 resize-none py-2 text-xs"
        />
        {voiceEnabled && !exhausted && (
          <VoiceInputButton
            onTranscription={handleVoiceTranscription}
            onError={handleVoiceError}
            disabled={pending}
            className="shrink-0"
          />
        )}
      </div>
      <button
        type="button"
        onClick={handleSend}
        disabled={pending || exhausted || draft.trim().length === 0}
        className="self-end inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {pending && <Loader2 className="size-3 animate-spin" />}
        Apply adjustment
      </button>
    </div>
  );
}
