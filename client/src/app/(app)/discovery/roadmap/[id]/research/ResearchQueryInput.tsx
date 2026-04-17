'use client';
// src/app/(app)/discovery/roadmap/[id]/research/ResearchQueryInput.tsx
//
// The first step of the research flow. Renders a single text input
// pre-populated with a suggested query derived from the task context.
// The founder can accept it, modify it, or type something completely
// different. Submitting fires the plan route.

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { VoiceInputButton } from '@/components/ui/VoiceInputButton';
import { canUseVoiceMode, useVoiceTier } from '@/lib/voice/client-tier';
import { trackVoiceEvent } from '@/lib/voice/analytics';

export interface ResearchQueryInputProps {
  onSubmit:           (query: string) => void;
  prePopulatedQuery?: string;
  loading?:           boolean;
}

/**
 * ResearchQueryInput
 *
 * One-input entry point for the Research Tool. Pre-populates the
 * query from task context when available. Calls `onSubmit` with the
 * trimmed query when the founder clicks "Plan my research" or presses
 * Enter.
 */
export function ResearchQueryInput({
  onSubmit,
  prePopulatedQuery,
  loading,
}: ResearchQueryInputProps) {
  const [query, setQuery] = useState(prePopulatedQuery ?? '');

  // Sync if parent provides an initial suggestion after mount
  useEffect(() => {
    if (prePopulatedQuery && query === '') {
      setQuery(prePopulatedQuery);
    }
  // We only want to apply this on the first time a suggestion arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prePopulatedQuery]);

  function handleSubmit() {
    const trimmed = query.trim();
    if (trimmed.length === 0 || loading) return;
    onSubmit(trimmed);
  }

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

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-muted-foreground">
        Ask anything about your market, competitors, potential customers,
        regulations, or pricing. Be specific for the best results.
      </p>

      <div className="flex items-start gap-2">
        <Textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          disabled={loading}
          rows={3}
          placeholder="e.g. Find restaurant owners in Accra who might need laundry services"
          className="min-h-0 flex-1 resize-none py-2 text-xs leading-relaxed"
        />
        {voiceEnabled && (
          <VoiceInputButton
            onTranscription={handleVoiceTranscription}
            onError={handleVoiceError}
            disabled={loading}
            className="shrink-0"
          />
        )}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={query.trim().length === 0 || loading}
        className="self-start flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <Search className="size-3 shrink-0" />
        Plan my research
      </button>
    </div>
  );
}
