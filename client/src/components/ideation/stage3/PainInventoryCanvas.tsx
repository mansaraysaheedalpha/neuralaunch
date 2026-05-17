'use client';

import { useState, type FormEvent } from 'react';
import { RadarIcon, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PainPoint, Stage3AuthoringState } from '@/lib/ideation/stage3-opportunities/schema';
import {
  MAX_SCOUT_RUNS,
  MIN_PAIN_POINTS_FOR_COMMIT,
  SHORTLIST_CAP,
} from '@/lib/ideation/stage3-opportunities/constants';
import type { FounderContextTag } from '@neuralaunch/constants';
import { PainPointCard } from './PainPointCard';
import type { PainPointPushbackResult } from './PainPointPushbackDrawer';
import { FounderPainPointForm } from './FounderPainPointForm';

export interface PainInventoryCanvasProps {
  state:           Stage3AuthoringState;
  scouting:        boolean;
  readOnly?:       boolean;
  onScout:         (founderQuery: string | null) => Promise<void>;
  onAddFounderPP:  (input: {
    description:    string;
    founderContext: FounderContextTag | null;
    founderNotes:   string | null;
  }) => Promise<void>;
  onScore:         (input: { id: string; intensity: number; frequency: number; nicheSpecificity: number }) => Promise<void>;
  onRemove:        (id: string) => Promise<void>;
  onPushback:      (input: { painPointId: string; message: string; priorVersion: number }) => Promise<PainPointPushbackResult>;
}

/**
 * Stage 3 canvas — composes the two pain-point columns (agent + founder),
 * the founder-input form, and the Pain Scout run controls. The canvas
 * is the truth surface: every card mutation goes through the narrow
 * routes and the page refreshes to pick up the new state.
 *
 * Readiness signal: the founder needs MIN_PAIN_POINTS_FOR_COMMIT
 * (3) rated viable pain points before composition is allowed. The
 * banner above the columns shows the count.
 */
export function PainInventoryCanvas({
  state,
  scouting,
  readOnly,
  onScout,
  onAddFounderPP,
  onScore,
  onRemove,
  onPushback,
}: PainInventoryCanvasProps) {
  const [scoutQuery, setScoutQuery] = useState('');

  const ratedCount = countViable(state);
  const atScoutCap = state.scoutRunCount >= MAX_SCOUT_RUNS;
  const showCascadeBanner = state.requiresRederivation;

  const submitScout = (e: FormEvent) => {
    e.preventDefault();
    if (atScoutCap || scouting || readOnly) return;
    void onScout(scoutQuery.trim().length > 0 ? scoutQuery.trim() : null);
  };

  return (
    <div className="space-y-4">
      {showCascadeBanner && (
        <div className="rounded-lg border border-gold/40 bg-gold/5 px-3 py-2 text-xs text-foreground">
          You updated Stage 1 or Stage 2 — the picks below are based on what you had before. Re-run the Pain Scout against your fresh outcome + requirements, or add your own pain points to rebuild.
        </div>
      )}

      <ReadinessRow ratedCount={ratedCount} />

      <form
        onSubmit={submitScout}
        className="rounded-lg border border-border bg-card/40 px-3 py-3 space-y-2"
        aria-label="Run the Pain Scout"
      >
        <header>
          <h3 className="text-sm font-semibold text-foreground">Pain Scout</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Optional query — leave empty and I&apos;ll scout against your committed Outcome + Requirements.
          </p>
        </header>
        <input
          type="text"
          value={scoutQuery}
          onChange={e => setScoutQuery(e.target.value)}
          disabled={readOnly || scouting || atScoutCap}
          maxLength={600}
          placeholder="e.g. WhatsApp customer support pain for small businesses"
          className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Runs: {state.scoutRunCount} / {MAX_SCOUT_RUNS}
            {atScoutCap && <span className="ml-1 text-amber-500">(at cap)</span>}
          </span>
          <Button type="submit" size="sm" disabled={readOnly || scouting || atScoutCap}>
            {scouting ? <RefreshCw className="size-3 mr-1 animate-spin" /> : <RadarIcon className="size-3 mr-1" />}
            {scouting ? 'Scouting…' : 'Run scout'}
          </Button>
        </div>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="space-y-3">
          <header>
            <h3 className="text-sm font-semibold text-foreground">Agent-surfaced</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              From community signals. Push back on what I got wrong; rate what survives.
            </p>
          </header>
          {state.agentPainPoints.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              No agent picks yet. Run the scout above.
            </div>
          ) : (
            state.agentPainPoints.map(pp => (
              <PainPointCard
                key={pp.id}
                painPoint={pp}
                readOnly={readOnly}
                onScore={onScore}
                onRemove={onRemove}
                onPushback={onPushback}
              />
            ))
          )}
        </section>

        <section className="space-y-3">
          <header>
            <h3 className="text-sm font-semibold text-foreground">Your own</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              From your life, the people you know, or industries you watch — usually the strongest signal.
            </p>
          </header>
          {state.founderPainPoints.length > 0 && state.founderPainPoints.map((pp: PainPoint) => (
            <PainPointCard
              key={pp.id}
              painPoint={pp}
              readOnly={readOnly}
              onScore={onScore}
              onRemove={onRemove}
            />
          ))}
          {!readOnly && (
            <FounderPainPointForm disabled={scouting} onAdd={onAddFounderPP} />
          )}
        </section>
      </div>
    </div>
  );
}

function countViable(state: Stage3AuthoringState): number {
  let n = 0;
  for (const p of state.agentPainPoints) if (p.status === 'rated' && p.combinedScore !== null) n++;
  for (const p of state.founderPainPoints) if (p.status === 'rated' && p.combinedScore !== null) n++;
  return n;
}

interface ReadinessRowProps {
  ratedCount: number;
}

function ReadinessRow({ ratedCount }: ReadinessRowProps) {
  const ready = ratedCount >= MIN_PAIN_POINTS_FOR_COMMIT;
  const cls = ready
    ? 'border-success/30 bg-success/5 text-foreground'
    : 'border-border bg-card/30 text-muted-foreground';
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${cls}`} role="status">
      {ready ? (
        <>
          You have <span className="font-mono text-foreground">{ratedCount}</span> rated pain points — ready to compose. Up to{' '}
          <span className="font-mono text-foreground">{SHORTLIST_CAP}</span> will make the shortlist.
        </>
      ) : (
        <>
          You have <span className="font-mono text-foreground">{ratedCount}</span> rated pain points. Compose unlocks at{' '}
          <span className="font-mono text-foreground">{MIN_PAIN_POINTS_FOR_COMMIT}</span>.
        </>
      )}
    </div>
  );
}
