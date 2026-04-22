'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchFollowUpInput.tsx
//
// Follow-up question input below the report. Shows the round counter
// ("1/5 follow-ups used") and disables when the max is reached.

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Send } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
// Import directly from constants for the max cap.
import { FOLLOWUP_MAX_ROUNDS } from '@/lib/roadmap/research-tool/constants';
import { VoiceInputButton } from '@/components/ui/VoiceInputButton';
import { canUseVoiceMode, useVoiceTier } from '@/lib/voice/client-tier';
import { trackVoiceEvent } from '@/lib/voice/analytics';

export interface ResearchFollowUpInputProps {
  round:    number;
  maxRounds?: number;
  onSubmit: (query: string) => void;
  disabled: boolean;
}

/**
 * ResearchFollowUpInput
 *
 * Text input + submit button for follow-up questions. Shows a round
 * counter so the founder knows how many follow-ups remain. Disables
 * when `disabled` is true or when the cap is reached.
 */
export function ResearchFollowUpInput({
  round,
  maxRounds = FOLLOWUP_MAX_ROUNDS,
  onSubmit,
  disabled,
}: ResearchFollowUpInputProps) {
  const [query, setQuery] = useState('');
  const capped            = round >= maxRounds;

  const voiceTier    = useVoiceTier();
  const voiceEnabled = canUseVoiceMode(voiceTier);

  const handleVoiceTranscription = (text: string) => {
    if (!text.trim()) return;
    setQuery(prev => prev.trim().length > 0 ? `${prev.trim()} ${text}` : text);
    trackVoiceEvent('voice_transcribed', { surface: 'research' });
  };

  const handleVoiceError = (message: string) => {
    trackVoiceEvent('voice_error', { surface: 'research', errorMessage: message });
    toast.error(message);
  };

  function handleSubmit() {
    const trimmed = query.trim();
    if (trimmed.length === 0 || disabled || capped) return;
    onSubmit(trimmed);
    setQuery('');
  }

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-foreground">Ask a follow-up</p>
        <span className="text-[10px] text-muted-foreground">
          {round}/{maxRounds} follow-ups used
        </span>
      </div>

      {capped ? (
        <p className="text-[11px] text-muted-foreground italic">
          You have used all {maxRounds} follow-up rounds. Start a new research session to continue.
        </p>
      ) : (
        <div className="flex gap-2 items-center">
          <Textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={disabled || capped}
            placeholder="Ask a follow-up question…"
            rows={3}
            className="min-h-0 flex-1 resize-none py-2 text-xs leading-relaxed"
          />
          {voiceEnabled && (
            <VoiceInputButton
              onTranscription={handleVoiceTranscription}
              onError={handleVoiceError}
              disabled={disabled || capped}
              className="shrink-0"
            />
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={query.trim().length === 0 || disabled || capped}
            className="shrink-0 flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Send className="size-3" />
            Ask
          </button>
        </div>
      )}
    </div>
  );
}
