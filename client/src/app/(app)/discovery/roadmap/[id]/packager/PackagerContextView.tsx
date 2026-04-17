'use client';
// src/app/(app)/discovery/roadmap/[id]/packager/PackagerContextView.tsx
//
// Renders the pre-populated ServiceContext for the founder to confirm
// or adjust before package generation. "This looks right" proceeds;
// the inline text input sends an adjustment message that loops the
// context exchange until status: ready.

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Search, Sparkles } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { VoiceInputButton } from '@/components/ui/VoiceInputButton';
import { canUseVoiceMode, useVoiceTier } from '@/lib/voice/client-tier';
import { trackVoiceEvent } from '@/lib/voice/analytics';
import type { ServiceContext } from '@/lib/roadmap/service-packager/schemas';

export interface PackagerContextViewProps {
  context:    ServiceContext;
  pending:    boolean;
  agentNote?: string | null;
  onConfirm:  () => void;
  onAdjust:   (message: string) => void;
}

/**
 * PackagerContextView
 *
 * Shows the pre-populated summary the agent assembled from the task,
 * belief state, and any research findings. The founder confirms or
 * sends an inline adjustment.
 */
export function PackagerContextView({
  context, pending, agentNote, onConfirm, onAdjust,
}: PackagerContextViewProps) {
  const [draft, setDraft] = useState('');

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

  function handleAdjust() {
    const text = draft.trim();
    if (!text) return;
    onAdjust(text);
    setDraft('');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-foreground leading-relaxed">
          Here&apos;s what the Packager already knows about your service. Confirm if it&apos;s right, or tell me what to adjust.
        </p>
      </div>

      {/* Research-session attribution: when the context carries findings
          digested from a prior researchSession on this task, surface a
          small badge so the founder can see the system is using their
          research work. The badge is purely visual — the findings
          themselves are already wired into the generation prompt via
          context.researchFindings below. */}
      {context.researchFindings && (
        <div className="flex items-center gap-1.5 text-[10px] text-primary rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 self-start">
          <Search className="size-3 shrink-0" />
          {context.researchQuery
            ? `Informed by your research on "${context.researchQuery.length > 60 ? context.researchQuery.slice(0, 57) + '...' : context.researchQuery}"`
            : 'Using findings from your research session'}
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/20 p-3 flex flex-col gap-2">
        <ContextRow label="Service summary"        value={context.serviceSummary} />
        <ContextRow label="Target market"          value={context.targetMarket} />
        {context.competitorPricing     && <ContextRow label="Competitor pricing"     value={context.competitorPricing} />}
        {context.founderCosts          && <ContextRow label="Your cost context"      value={context.founderCosts} />}
        {context.availableHoursPerWeek && <ContextRow label="Available hours/week"   value={context.availableHoursPerWeek} />}
        {context.researchFindings      && <ContextRow label="Research findings"      value={context.researchFindings} />}
      </div>

      {agentNote && (
        <p className="text-[11px] text-muted-foreground italic">{agentNote}</p>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Want to adjust anything?
        </label>
        <div className="flex items-start gap-2">
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={2}
            placeholder='e.g. "actually I want to focus on guest houses, not hotels"'
            disabled={pending}
            className="min-h-0 flex-1 resize-none py-2 text-xs"
          />
          {voiceEnabled && (
            <VoiceInputButton
              onTranscription={handleVoiceTranscription}
              onError={handleVoiceError}
              disabled={pending}
              className="shrink-0"
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          This looks right — generate the package
        </button>
        <button
          type="button"
          onClick={handleAdjust}
          disabled={pending || draft.trim().length === 0}
          className="rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60"
        >
          Send adjustment
        </button>
      </div>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}
