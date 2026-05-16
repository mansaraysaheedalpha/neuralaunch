'use client';

import { useState } from 'react';
import { ExternalLink, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PainPoint } from '@/lib/ideation/stage3-opportunities/schema';
import { FOUNDER_CONTEXT_LABELS } from './labels';
import { PainPointPushbackDrawer, type PainPointPushbackResult } from './PainPointPushbackDrawer';
import { ScoreRow, type ScoreAxis } from './ScoreRow';

export interface PainPointCardProps {
  painPoint:    PainPoint;
  readOnly?:    boolean;
  onScore:      (input: { id: string; intensity: number; frequency: number; nicheSpecificity: number }) => Promise<void>;
  onRemove:     (id: string) => Promise<void>;
  onPushback?:  (input: { painPointId: string; message: string; priorVersion: number }) => Promise<PainPointPushbackResult>;
}

/**
 * Single pain-point card. Both source variants (agent + founder) share
 * the three-axis score input; only the metadata + push-back affordance
 * differ. Local slider state mirrors the persisted founderFinalScores
 * so the founder can dial in before saving with a single tap.
 */
export function PainPointCard({
  painPoint,
  readOnly,
  onScore,
  onRemove,
  onPushback,
}: PainPointCardProps) {
  const [intensity, setIntensity] = useState<number>(painPoint.founderFinalScores?.intensity ?? 3);
  const [frequency, setFrequency] = useState<number>(painPoint.founderFinalScores?.frequency ?? 3);
  const [nicheSpecificity, setNicheSpecificity] = useState<number>(painPoint.founderFinalScores?.nicheSpecificity ?? 3);
  const [pushbackOpen, setPushbackOpen] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFounder = painPoint.source === 'founder';
  const rated     = painPoint.status === 'rated' && painPoint.founderFinalScores !== null;

  const handleSaveScore = async () => {
    setError(null);
    setSavingScore(true);
    try {
      await onScore({ id: painPoint.id, intensity, frequency, nicheSpecificity });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save score');
    } finally {
      setSavingScore(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setRemoving(true);
    try {
      await onRemove(painPoint.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove');
      setRemoving(false);
    }
  };

  return (
    <article className="rounded-lg border border-border bg-card/40 px-3 py-3">
      <header className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="rounded bg-muted/60 px-1.5 py-0.5 font-medium uppercase tracking-wider">
              {isFounder ? 'You added' : 'Agent surfaced'}
            </span>
            {isFounder && painPoint.founderContext && (
              <span>{FOUNDER_CONTEXT_LABELS[painPoint.founderContext]}</span>
            )}
            {!isFounder && painPoint.communityOrigin && (
              <span>{painPoint.communityOrigin}</span>
            )}
          </div>
          <p className="text-sm text-foreground leading-snug">{painPoint.description}</p>
          {isFounder && painPoint.founderNotes && (
            <p className="mt-1 text-xs text-muted-foreground italic">{painPoint.founderNotes}</p>
          )}
          {!isFounder && painPoint.agentRelevanceNote && (
            <p className="mt-1 text-xs text-muted-foreground italic">{painPoint.agentRelevanceNote}</p>
          )}
          {!isFounder && painPoint.evidenceExcerpt && (
            <blockquote className="mt-2 border-l-2 border-border pl-2 text-xs text-muted-foreground">
              &ldquo;{painPoint.evidenceExcerpt}&rdquo;
              {painPoint.evidenceUrl && (
                <a
                  href={painPoint.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  source <ExternalLink className="size-3" />
                </a>
              )}
            </blockquote>
          )}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={removing}
            aria-label="Remove pain point"
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/5 disabled:opacity-50"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </header>

      {!isFounder && painPoint.agentSuggestedScores && (
        <div className="mb-2 rounded bg-card/60 px-2 py-1.5 text-xs">
          <span className="text-muted-foreground">Agent suggested:</span>{' '}
          <span className="font-mono text-foreground">
            i={painPoint.agentSuggestedScores.intensity} ·
            f={painPoint.agentSuggestedScores.frequency} ·
            n={painPoint.agentSuggestedScores.nicheSpecificity}
          </span>
          <span className="ml-1 text-muted-foreground">
            ({painPoint.agentSuggestedScores.reasoningPerMetric})
          </span>
        </div>
      )}

      <div className="space-y-2">
        {(['intensity', 'frequency', 'nicheSpecificity'] as ScoreAxis[]).map(axis => (
          <ScoreRow
            key={axis}
            axis={axis}
            value={axis === 'intensity' ? intensity : axis === 'frequency' ? frequency : nicheSpecificity}
            onChange={v => {
              if (axis === 'intensity')        setIntensity(v);
              else if (axis === 'frequency')   setFrequency(v);
              else                              setNicheSpecificity(v);
            }}
            disabled={readOnly || savingScore}
          />
        ))}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            Combined: <span className="font-mono text-foreground">{intensity * frequency * nicheSpecificity}</span>
            {rated && painPoint.combinedScore !== null && intensity * frequency * nicheSpecificity !== painPoint.combinedScore && (
              <span className="ml-1 text-amber-500">(unsaved)</span>
            )}
          </span>
          <div className="flex gap-2">
            {!readOnly && !isFounder && onPushback && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPushbackOpen(o => !o)}
                disabled={savingScore}
              >
                <MessageSquare className="size-3 mr-1" />
                {pushbackOpen ? 'Hide pushback' : 'Push back'}
              </Button>
            )}
            {!readOnly && (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSaveScore()}
                disabled={savingScore}
              >
                {savingScore ? 'Saving…' : rated ? 'Update rating' : 'Rate this'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="mt-2 text-xs text-destructive">{error}</div>}

      {pushbackOpen && onPushback && (
        <PainPointPushbackDrawer
          painPoint={painPoint}
          onPushback={onPushback}
          onClose={() => setPushbackOpen(false)}
        />
      )}
    </article>
  );
}
