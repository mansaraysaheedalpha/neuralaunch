// src/app/(app)/discovery/no-idea/[sessionId]/Stage5Page.tsx
//
// Stage 5 — Validation Handoff. Institute treatment. Server component
// composes the static cover/memo/reserves layer + hands off the
// synthesis CTA (the "moment") + in-flight overlay + success/failure
// transitions to <Stage5Client>.

import Link from 'next/link';
import { TopBar, Pill } from '@/components/institute';
import {
  HandoffCover,
  ChosenMemo,
  ReservesLedger,
} from '@/components/institute/no-idea';
import { Stage5Client } from './Stage5Client';
import type {
  ChosenOpportunitySnapshot,
  ReserveOpportunity,
} from '@/lib/ideation/stage5-handoff/schema';

interface Stage5PageProps {
  sessionId:             string;
  chosen:                ChosenOpportunitySnapshot;
  reserves:              ReadonlyArray<ReserveOpportunity>;
  requiresRederivation:  boolean;
  existingJobId:         string | null;
  lastFailureMessage:    string | null;
}

export function Stage5Page({
  sessionId,
  chosen,
  reserves,
  requiresRederivation,
  existingJobId,
  lastFailureMessage,
}: Stage5PageProps) {
  const shortId = sessionId.slice(0, 6);
  return (
    <div className="flex h-full flex-col">
      <TopBar
        crumb={[
          { label: 'No Idea', accent: true },
          { label: `Session ${shortId}` },
          { label: 'Stage V · Handoff', current: true },
        ]}
        rightStatus={<Pill accent>● Pre-synthesis review</Pill>}
        rightActions={
          <Link href={`/discovery/no-idea/${sessionId}`} className="text-muted transition-colors hover:text-fg">
            ← Stage IV
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <HandoffCover />

        {requiresRederivation && (
          <div className="max-w-[1320px] border-y border-amber/40 bg-amber/[0.05] px-6 py-3 font-serif text-[14px] italic text-fg-2 sm:px-12 lg:px-20">
            <span className="mr-2 font-mono text-[10px] not-italic uppercase tracking-[0.14em] text-amber">Cascade</span>
            Stage 1, 2 or 3 changed since this was prepared — re-derive before committing.
          </div>
        )}

        {/* Memo + Reserves body */}
        <div className="grid max-w-[1320px] grid-cols-1 gap-12 px-6 py-20 sm:px-12 lg:grid-cols-[1.4fr_1fr] lg:gap-20 lg:px-20">
          <ChosenMemo chosen={chosen} />
          <ReservesLedger reserves={reserves} />
        </div>

        {/* The moment — CTA band + in-flight overlay + terminal
            transitions all rendered by Stage5Client. */}
        <Stage5Client
          sessionId={sessionId}
          initialJobId={existingJobId}
          initialFailureMessage={lastFailureMessage}
          cascadeStale={requiresRederivation}
        />

        <footer className="max-w-[1320px] border-t border-rule px-6 py-8 font-mono text-[10.5px] leading-[1.6] tracking-[0.04em] text-muted sm:px-12 lg:px-20">
          Stage V of V · Synthesis happens once per session. You can re-fire it from the recommendation review if upstream evidence changes.
        </footer>
      </div>
    </div>
  );
}
