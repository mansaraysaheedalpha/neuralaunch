'use client';
// src/app/(app)/discovery/no-idea/[sessionId]/Stage4Chat.tsx
//
// Stage 4 — Opportunity Docket, Institute treatment. Replaces the
// per-row expanding card pattern with a docket ledger (top-level
// view — ranking legible at a glance) plus a full-page focus overlay
// (per-opportunity deep behaviour). The Layer A / Layer B / verdict
// interactive widgets are reused unchanged inside the focus body so
// every transport (deriveLayerA, generateScript, submitText,
// presign+submitImage, removeResponse, pickVerdict, pushback) stays
// owned by useStage4Session.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TopBar, Pill, StageBanner } from '@/components/institute';
import {
  OpportunityDocket,
  OpportunityFocus,
  countAdvancing,
} from '@/components/institute/no-idea';
import { OpportunityEvaluationView } from '@/components/ideation/stage4/OpportunityEvaluationView';
import {
  MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT,
  MAX_OPPORTUNITIES_PER_STAGE,
} from '@/lib/ideation/stage4-opportunities/constants';
import type { Stage4AuthoringState } from '@/lib/ideation/stage4-opportunities/schema';
import { useStage4Session, type Stage4Message } from './useStage4Session';

interface Stage4ChatProps {
  sessionId:       string;
  stageRunId:      string;
  firstName:       string;
  initialMessages: Stage4Message[];
  state:           Stage4AuthoringState;
}

const STAGE4_BANNER_BODY = (
  <>
    Five opportunities derived from your pain shortlist. Each has two layers —{' '}
    <em>Layer A: agent research</em> and <em>Layer B: a small test you run in
    the world.</em> Stamp a verdict on each. Click any row to open the
    full-page focus view.
  </>
);

export function Stage4Chat({
  sessionId,
  stageRunId: _stageRunId,
  firstName: _firstName,
  initialMessages,
  state,
}: Stage4ChatProps) {
  const router = useRouter();
  const session = useStage4Session({ sessionId, stageRunId: _stageRunId, initialMessages });
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const opportunities = state.opportunities;
  const advancing = useMemo(() => countAdvancing(opportunities), [opportunities]);
  const evaluatedCount = opportunities.filter((o) => o.status === 'evaluated').length;
  const canCompose = advancing >= MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT;
  const isBusy =
    session.status === 'sending' || session.status === 'streaming' ||
    session.status === 'composing' || session.status === 'deriving' ||
    session.status === 'generating' || session.status === 'submitting';
  const isTerminated = session.status === 'terminated';

  const shortId = sessionId.slice(0, 6);

  const focusedOpp = focusIndex !== null ? opportunities[focusIndex] : null;
  const focusedResponses = focusedOpp
    ? state.founderCommunityResponses.filter((r) => r.opportunityId === focusedOpp.id)
    : [];

  const openOpp = (oppId: string) => {
    const i = opportunities.findIndex((o) => o.id === oppId);
    if (i >= 0) setFocusIndex(i);
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar
        crumb={[
          { label: 'No Idea', accent: true },
          { label: `Session ${shortId}` },
          { label: 'Stage IV · Docket', current: true },
        ]}
        rightStatus={
          <Pill accent>
            ● {opportunities.length} opport{opportunities.length === 1 ? 'unity' : 'unities'}
          </Pill>
        }
        rightActions={
          <Link href={`/discovery/no-idea/${sessionId}`} className="text-muted transition-colors hover:text-fg">
            ← Stage III
          </Link>
        }
      />

      <StageBanner
        sessionId={sessionId}
        stage={4}
        totalStages={5}
        title="Opportunity Evaluations"
        body={STAGE4_BANNER_BODY}
        forceVisible={opportunities.length === 0}
      />

      {state.requiresRederivation && (
        <div className="border-y border-amber/40 bg-amber/[0.05] px-6 py-3 font-serif text-[14px] italic text-fg-2 sm:px-12 lg:px-16">
          <span className="mr-2 font-mono text-[10px] not-italic uppercase tracking-[0.14em] text-amber">Cascade</span>
          Stage I, II, or III changed since these were derived — re-derive Layer A on each opportunity, or commit again to start fresh.
        </div>
      )}

      {session.turnError && (
        <div className="border-b border-amber/40 bg-amber/[0.05] px-6 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-amber sm:px-12 lg:px-16">
          {session.turnError.message}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Header band */}
        <header className="border-b border-rule px-6 pb-7 pt-10 sm:px-12 lg:px-16">
          <div className="mb-5 flex flex-wrap gap-[18px] font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            <span>Stage <span className="text-accent">IV</span> of V · Opportunity Evaluations</span>
            <span>{opportunities.length} candidates · {advancing} advancing</span>
            <span>Layer A · 6-step · Layer B · founder-run</span>
          </div>
          <h1 className="font-sans text-fg [font-size:clamp(40px,5.2vw,72px)] [font-weight:500] [line-height:1] [letter-spacing:-0.025em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
            The <em>docket.</em>
          </h1>
          <p className="mt-4 max-w-[760px] text-[16px] leading-[1.55] text-fg-2 [&_em]:font-serif [&_em]:italic [&_em]:text-accent">
            Five opportunities derived from your pain shortlist. Each has two layers — <em>Layer A: agent research</em> and <em>Layer B: a small test you run in the world.</em> Stamp a verdict on each. Click any row to open the full-page focus view.
          </p>
        </header>

        {/* Canvas — docket + rail */}
        <div className="grid grid-cols-1 gap-12 px-6 pb-24 pt-8 sm:px-12 lg:grid-cols-[1fr_340px] lg:px-16">
          <main>
            <OpportunityDocket opportunities={opportunities} onOpen={openOpp} />
          </main>

          <aside className="grid content-start gap-6 lg:sticky lg:top-20 lg:self-start">
            {/* Progress */}
            <div className="border border-rule bg-bg-2 px-5 py-[18px]">
              <div className="mb-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                <span>Progress</span>
                <span className="text-accent">{evaluatedCount} of {opportunities.length} evaluated</span>
              </div>
              <div className="font-serif text-[42px] italic leading-none tracking-[-0.02em] text-accent">
                {advancing}
                <span className="text-[22px] text-muted"> advancing</span>
              </div>
              <div className="relative mt-3.5 h-1 bg-rule">
                <div className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-500" style={{ width: `${Math.min(100, (advancing / MAX_OPPORTUNITIES_PER_STAGE) * 100)}%` }} />
              </div>
              <p className="mt-3 font-mono text-[10px] leading-[1.6] tracking-[0.04em] text-muted">
                Composition unlocks at {MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT} advanced. You can advance up to {MAX_OPPORTUNITIES_PER_STAGE}; the reserves are held in continuation.
              </p>
            </div>

            {/* Legend */}
            <div className="border border-rule bg-bg-2 px-5 py-[18px]">
              <div className="mb-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                <span>Reading the docket</span>
              </div>
              <p className="mb-2 font-mono text-[11.5px] leading-[1.55] tracking-[0.04em] text-fg-2">
                <span className="text-fg">● ● ● ●</span> · <span className="text-accent">verified</span> validation. The world said yes.
              </p>
              <p className="mb-2 font-mono text-[11.5px] leading-[1.55] tracking-[0.04em] text-fg-2">
                <span className="text-fg">● ● ● ○</span> · likely. Worth advancing if the others fail.
              </p>
              <p className="mb-2 font-mono text-[11.5px] leading-[1.55] tracking-[0.04em] text-fg-2">
                <span className="text-fg">● ○ ○ ○</span> · <span className="text-accent">contradictory</span>. The world said no.
              </p>
              <p className="font-mono text-[11.5px] leading-[1.55] tracking-[0.04em] text-fg-2">
                <span className="text-fg">○ ○ ○ ○</span> · not yet run.
              </p>
            </div>

            {/* Commit */}
            <div
              className="border border-accent px-5 py-[18px]"
              style={{ background: 'linear-gradient(180deg, rgba(255,90,60,0.08), rgba(255,90,60,0.02))' }}
            >
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">When ready</div>
              <h4 className="mb-1.5 font-serif text-[22px] font-normal italic leading-[1.15] tracking-[-0.01em] text-fg [&_em]:text-accent">
                Compose <em>evaluations.</em>
              </h4>
              <p className="mb-3.5 text-[12.5px] leading-[1.5] text-fg-2">
                Locks in the verdicts. Stage V proceeds with the chosen opportunity and reserves.
              </p>
              <button
                type="button"
                disabled={!canCompose || isBusy || isTerminated}
                onClick={() => {
                  // The Stage 4 advance is fired by the composer agent
                  // once verdicts are stamped — same pattern as Stage 3.
                  // router.refresh() picks up the next status on poll.
                  router.refresh();
                }}
                className="flex w-full items-center justify-center gap-2.5 bg-accent px-3 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Compose evaluations
                <span aria-hidden="true">→</span>
              </button>
              {!canCompose && (
                <p className="mt-2 font-mono text-[10px] leading-[1.5] tracking-[0.04em] text-muted">
                  Need at least {MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT} advanced.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Full-page focus overlay — reuses the existing
          OpportunityEvaluationView inside the body so every transport
          (deriveLayerA, generateScript, response upload, verdict pick,
          pushback) stays unchanged. The interactive widgets carry the
          legacy palette inside the focus body — flagged for a later
          primitive-pass PR. */}
      <OpportunityFocus
        index={focusIndex}
        opportunities={opportunities}
        onClose={() => setFocusIndex(null)}
        onNavigate={(next) => setFocusIndex(next)}
      >
        {focusedOpp && (
          <OpportunityEvaluationView
            opportunity={focusedOpp}
            responses={focusedResponses}
            deriving={session.derivingFor === focusedOpp.id}
            generating={session.generatingFor === focusedOpp.id}
            readOnly={isTerminated}
            onDeriveLayerA={() => session.deriveLayerA(focusedOpp.id)}
            onGenerateScript={() => session.generateScript(focusedOpp.id)}
            onSubmitText={session.submitText}
            onPresign={session.presign}
            onSubmitImage={session.submitImage}
            onRemoveResponse={session.removeResponse}
            onPickVerdict={(v) => session.pickVerdict(focusedOpp.id, v)}
            onPushback={session.pushback}
          />
        )}
      </OpportunityFocus>
    </div>
  );
}
