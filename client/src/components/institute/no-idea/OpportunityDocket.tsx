'use client';
// src/components/institute/no-idea/OpportunityDocket.tsx
//
// The Stage 4 docket — one ledger of all opportunities. Always-visible
// Layer A / Layer B / verdict columns, no per-row expansion. Clicking
// a row opens a full-page focus overlay (handled by the parent).

import type { OpportunityEvaluation } from '@/lib/ideation/stage4-opportunities/schema';
import { DocketRow } from './DocketRow';

export interface OpportunityDocketProps {
  opportunities: OpportunityEvaluation[];
  onOpen:        (oppId: string) => void;
}

export function OpportunityDocket({ opportunities, onOpen }: OpportunityDocketProps) {
  if (opportunities.length === 0) {
    return (
      <div className="border-b border-rule py-12 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        No opportunities yet. Commit Stage III to seed the docket.
      </div>
    );
  }
  return (
    <div>
      <div className="grid grid-cols-[40px_1fr] gap-3 border-b border-rule px-3 py-3.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted lg:grid-cols-[50px_1.6fr_130px_180px_140px_50px] lg:gap-[18px] lg:px-5">
        <div>·</div>
        <div>Opportunity</div>
        <div className="hidden text-accent lg:block">Layer A</div>
        <div className="hidden lg:block">Layer B</div>
        <div className="hidden lg:block">Verdicts</div>
        <div className="hidden lg:block" />
      </div>
      {opportunities.map((opp, i) => (
        <DocketRow key={opp.id} opp={opp} index={i} onOpen={onOpen} />
      ))}
    </div>
  );
}
