'use client';
// src/app/(app)/discovery/no-idea/[sessionId]/Stage3Chat.tsx
//
// Stage 3 — Pain Inventory, Institute treatment. Unified ledger with
// dot-scoring + signal-weighted typography. Render layer only —
// useStage3Session keeps owning every transport (runPainScout,
// addFounderPainPoint, scorePainPoint, removePainPoint, sendMessage,
// runPushbackRound).

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { TopBar, Pill, StageBanner } from '@/components/institute';
import {
  PainLedger,
  ScoutStrip,
  ShortlistPanel,
  countViable,
} from '@/components/institute/no-idea';
import { FOUNDER_CONTEXT_TAGS, type FounderContextTag } from '@neuralaunch/constants';
import { FOUNDER_CONTEXT_LABELS } from '@/components/ideation/stage3/labels';
import {
  MAX_SCOUT_RUNS,
  MIN_PAIN_POINTS_FOR_COMMIT,
  SHORTLIST_CAP,
} from '@/lib/ideation/stage3-opportunities/constants';
import type {
  PainPoint,
  Stage3AuthoringState,
} from '@/lib/ideation/stage3-opportunities/schema';
import { useStage3Session, type Stage3Message } from './useStage3Session';

interface Stage3ChatProps {
  sessionId:       string;
  stageRunId:      string;
  firstName:       string;
  initialMessages: Stage3Message[];
  state:           Stage3AuthoringState;
}

const STAGE3_BANNER_BODY = (
  <>
    The Pain Scout fans out across community signals, Tavily and Exa for pains
    that match what you&rsquo;re built to execute. <em>Score what survives</em>{' '}
    on intensity, frequency, and niche specificity, add your own pains from
    personal observation, and shortlist up to five before composing the
    inventory.
  </>
);

export function Stage3Chat({
  sessionId,
  stageRunId: _stageRunId,
  firstName: _firstName,
  initialMessages,
  state,
}: Stage3ChatProps) {
  const router = useRouter();
  const {
    status,
    turnError,
    runPainScout,
    addFounderPainPoint,
    scorePainPoint,
    removePainPoint,
  } = useStage3Session({ sessionId, stageRunId: _stageRunId, initialMessages });

  // Merge agent + founder pains into a single chronological ledger.
  // Founder pains appended after agent pains so scout-surfaced rows
  // lead — matches the reference's roman ordering (I-VII scout, then
  // VIII+ founder-added).
  const allPains = useMemo<PainPoint[]>(
    () => [...state.agentPainPoints, ...state.founderPainPoints],
    [state.agentPainPoints, state.founderPainPoints],
  );

  const viableCount  = useMemo(() => countViable(allPains), [allPains]);
  const canCompose   = viableCount >= MIN_PAIN_POINTS_FOR_COMMIT;
  const scouting     = status === 'scouting';
  const isBusy       = status === 'sending' || status === 'streaming' || status === 'composing' || scouting;
  const isTerminated = status === 'terminated';

  const shortId = sessionId.slice(0, 6);

  const handleScore = (input: { id: string; intensity: number; frequency: number; nicheSpecificity: number }) => {
    void scorePainPoint(input);
  };
  const handleRemove = (id: string) => { void removePainPoint(id); };
  const handleScout  = () => { void runPainScout(null); };
  const handleAdd    = async (input: {
    description: string;
    founderContext: FounderContextTag | null;
    founderNotes: string | null;
  }) => addFounderPainPoint(input);

  return (
    <div className="flex h-full flex-col">
      <TopBar
        crumb={[
          { label: 'No Idea', accent: true },
          { label: `Session ${shortId}` },
          { label: 'Stage III · Pains', current: true },
        ]}
        rightStatus={
          <Pill accent>
            <span aria-hidden="true" className="mr-2 inline-block size-[6px] animate-pulse rounded-full bg-accent" style={{ animationDuration: '1.6s' }} />
            {scouting ? 'Scouting' : 'Authoring'}
          </Pill>
        }
        rightActions={
          <Link href={`/discovery/no-idea/${sessionId}`} className="text-muted transition-colors hover:text-fg">
            ← Stage II
          </Link>
        }
      />

      <StageBanner
        sessionId={sessionId}
        stage={3}
        totalStages={5}
        title="Pain Inventory"
        body={STAGE3_BANNER_BODY}
        forceVisible={allPains.length === 0}
      />

      {state.requiresRederivation && (
        <div className="border-y border-amber/40 bg-amber/[0.05] px-6 py-3 font-serif text-[14px] italic text-fg-2 sm:px-12 lg:px-16">
          <span className="mr-2 font-mono text-[10px] not-italic uppercase tracking-[0.14em] text-amber">Cascade</span>
          Stage 1 or 2 changed since these were derived. Re-run the scout to refresh.
        </div>
      )}

      {turnError && (
        <div className="border-b border-amber/40 bg-amber/[0.05] px-6 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-amber sm:px-12 lg:px-16">
          {turnError.message}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Header band */}
        <header className="border-b border-rule px-6 pb-7 pt-10 sm:px-12 lg:px-16">
          <div className="mb-6 flex flex-wrap gap-[18px] font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            <span>Stage <span className="text-accent">III</span> of V · Pain Inventory</span>
            <span>Scout runs · {state.scoutRunCount} of {MAX_SCOUT_RUNS}</span>
            <span>Saved continuously</span>
          </div>
          <h1 className="max-w-[1100px] font-sans text-fg [font-size:clamp(38px,5.4vw,72px)] [font-weight:500] [line-height:1] [letter-spacing:-0.025em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
            Where the <em>real pain</em> is.
          </h1>
          <p className="mt-5 max-w-[760px] text-[16px] leading-[1.55] text-fg-2 [&_em]:font-serif [&_em]:italic [&_em]:text-accent [&_strong]:font-medium [&_strong]:text-fg">
            The Pain Scout has fanned out across <strong>community signals, Tavily and Exa</strong> for pains that match what you&rsquo;re built to execute. Tap each pain to <em>score it,</em> add your own from personal observation, and shortlist up to five before composing the inventory.
          </p>

          <ScoutStrip
            runCount={state.scoutRunCount}
            maxRuns={MAX_SCOUT_RUNS}
            scouting={scouting}
            disabled={isTerminated}
            onScout={handleScout}
          />
        </header>

        {/* Canvas */}
        <div className="grid grid-cols-1 gap-12 px-6 pb-20 pt-8 sm:px-12 lg:grid-cols-[1fr_340px] lg:px-16">
          <main>
            <PainLedger
              pains={allPains}
              onScore={handleScore}
              onRemove={handleRemove}
              readOnly={isTerminated}
            />

            <AddPainRow disabled={isBusy || isTerminated} onAdd={handleAdd} />
          </main>

          <aside className="grid content-start gap-6 lg:sticky lg:top-20 lg:self-start">
            <ShortlistPanel viable={viableCount} floor={MIN_PAIN_POINTS_FOR_COMMIT} cap={SHORTLIST_CAP} />

            <ScoutLogPanel runCount={state.scoutRunCount} maxRuns={MAX_SCOUT_RUNS} />

            <div
              className="border border-accent px-5 py-[18px]"
              style={{ background: 'linear-gradient(180deg, rgba(255,90,60,0.08), rgba(255,90,60,0.02))' }}
            >
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">When ready</div>
              <h4 className="mb-1.5 font-serif text-[22px] font-normal italic leading-[1.15] tracking-[-0.01em] text-fg [&_em]:text-accent">
                Compose the <em>inventory.</em>
              </h4>
              <p className="mb-3.5 text-[12.5px] leading-[1.5] text-fg-2">
                The composer writes the inventory document. Pre-commit review before Stage IV.
              </p>
              <button
                type="button"
                disabled={!canCompose || isBusy}
                onClick={() => {
                  // Composition is triggered by the agent's output_ready
                  // event in the existing flow; until an explicit
                  // founder-driven compose route exists, we surface the
                  // commit affordance and let the founder navigate
                  // forward — the page router auto-advances when
                  // composition completes (router.refresh re-polls).
                  router.refresh();
                }}
                className="flex w-full items-center justify-center gap-2.5 bg-accent px-3 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isBusy && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}
                Compose inventory
                {!isBusy && <span aria-hidden="true">→</span>}
              </button>
              {!canCompose && (
                <p className="mt-2 font-mono text-[10px] leading-[1.5] tracking-[0.04em] text-muted">
                  Need {MIN_PAIN_POINTS_FOR_COMMIT - viableCount} more viable pain{MIN_PAIN_POINTS_FOR_COMMIT - viableCount === 1 ? '' : 's'} ({viableCount}/{MIN_PAIN_POINTS_FOR_COMMIT}).
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  AddPainRow — dashed-border expandable founder-add prompt                  */
/* -------------------------------------------------------------------------- */

function AddPainRow({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (input: {
    description: string;
    founderContext: FounderContextTag | null;
    founderNotes: string | null;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [context, setContext] = useState<FounderContextTag | ''>('');
  const [submitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !disabled && !submitting && description.trim().length > 0 && context !== '';

  const onCancel = () => {
    setOpen(false);
    setDescription('');
    setContext('');
    setError(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    startSubmit(async () => {
      setError(null);
      try {
        await onAdd({
          description:    description.trim(),
          founderContext: (context as FounderContextTag) || null,
          founderNotes:   null,
        });
        setDescription('');
        setContext('');
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not add the pain.');
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className="mt-4 grid w-full gap-2.5 border border-dashed border-rule-strong bg-transparent px-6 py-4 text-left font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span><span className="text-accent">+</span> &nbsp; Add a pain you&rsquo;ve observed personally</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-2.5 border border-rule bg-bg-2 px-6 py-4"
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        Add a pain you&rsquo;ve observed personally
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={600}
        placeholder="Describe the pain in one sentence. What hurts, for whom, in what context."
        className="w-full resize-y border border-rule bg-transparent px-3 py-2.5 font-sans text-[14.5px] leading-[1.5] text-fg outline-none placeholder:text-muted-2 focus:border-accent"
        rows={3}
        disabled={submitting}
      />
      <div className="grid items-center gap-2.5 sm:grid-cols-[1fr_auto_auto]">
        <select
          value={context}
          onChange={(e) => setContext(e.target.value as FounderContextTag | '')}
          disabled={submitting}
          className="border border-rule bg-bg-3 px-3 py-2 font-sans text-[13px] text-fg"
        >
          <option value="">Context · pick one</option>
          {FOUNDER_CONTEXT_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              Context · {FOUNDER_CONTEXT_LABELS[tag].toLowerCase()}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="border border-rule-strong px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 bg-accent px-3.5 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {submitting && <Loader2 aria-hidden="true" className="size-3 animate-spin" />}
          Add to inventory →
        </button>
      </div>
      {error && (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-amber">{error}</p>
      )}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Scout log panel — right rail                                              */
/* -------------------------------------------------------------------------- */

function ScoutLogPanel({ runCount, maxRuns }: { runCount: number; maxRuns: number }) {
  // The schema doesn't persist a per-run log (only `scoutRunCount`).
  // We surface the count + remaining budget here. A future schema
  // extension can carry per-run summaries; the panel is shaped to
  // receive them when they exist.
  const remaining = Math.max(0, maxRuns - runCount);
  return (
    <div className="border border-rule bg-bg-2 px-5 py-[18px]">
      <div className="mb-3.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        <span>Scout log</span>
        <span>{remaining} left</span>
      </div>
      {runCount === 0 ? (
        <p className="font-mono text-[11px] leading-[1.55] tracking-[0.04em] text-muted">
          The scout hasn&rsquo;t been fired yet. Click <span className="text-accent">Run scout</span> above to surface community signals.
        </p>
      ) : (
        <p className="font-mono text-[11px] leading-[1.55] tracking-[0.04em] text-muted">
          {runCount} scout run{runCount === 1 ? '' : 's'} fired. Each run drives an 8-step Sonnet loop with Tavily + Exa + community_pulse.
        </p>
      )}
    </div>
  );
}
