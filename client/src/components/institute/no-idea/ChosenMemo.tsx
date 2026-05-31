// src/components/institute/no-idea/ChosenMemo.tsx
//
// Stage 5 chosen-opportunity memo. Five-row hairline dimensions
// ledger mapping the schema's ChosenOpportunitySnapshot into the
// reference's i-v rows: pain · Layer A signal · Layer B signal · fit
// to outcome · what synthesis produces.

import type { ChosenOpportunitySnapshot } from '@/lib/ideation/stage5-handoff/schema';
import { VALIDATION_STRENGTH_LABELS } from '@/components/ideation/stage4/labels';

const SIGNAL_GLYPH: Record<string, string> = {
  strong:        '●●●●',
  mixed:         '●●●○',
  weak:          '●●○○',
  contradictory: '●○○○',
};

export interface ChosenMemoProps {
  chosen: ChosenOpportunitySnapshot;
}

export function ChosenMemo({ chosen }: ChosenMemoProps) {
  const layerB = chosen.layerBSummary;
  const strengthGlyph = layerB ? SIGNAL_GLYPH[layerB.validationStrength] ?? '○○○○' : '○○○○';
  const strengthLabel = layerB ? VALIDATION_STRENGTH_LABELS[layerB.validationStrength] : 'Not run';

  // Reduce Layer A confidence into a one-sentence summary. Picks the
  // highest-confidence dimension as the lead; the rest are folded into
  // a "verified across N dimensions" stamp. Honest fallback when
  // layerASummary is null.
  const layerARow = chosen.layerASummary
    ? renderLayerARow(chosen.layerASummary)
    : 'Layer A research did not complete for this opportunity. The synthesis will rely on Layer B + your outcome.';

  const layerBRow = layerB
    ? renderLayerBRow(layerB)
    : 'No community responses landed on this opportunity. The synthesis will rely on Layer A + your outcome.';

  return (
    <main>
      <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
        <span className="text-accent">Your chosen path</span> &nbsp;·&nbsp; Validation strength · <span className="text-accent">{strengthGlyph} {strengthLabel.toLowerCase()}</span>
      </div>
      <h2 className="mb-6 font-sans text-fg [font-size:clamp(32px,4.2vw,56px)] [font-weight:500] [line-height:1.02] [letter-spacing:-0.025em] [&_em]:font-serif [&_em]:italic [&_em]:font-normal [&_em]:text-accent">
        {chosen.painPointSummary}
      </h2>

      {chosen.agentReasoning && (
        <p className="mb-8 max-w-[580px] border-l-2 border-accent pl-5 font-serif text-[18px] italic leading-[1.4] text-fg-2 [&_em]:not-italic [&_em]:font-medium [&_em]:font-sans [&_em]:text-fg">
          {chosen.agentReasoning}
        </p>
      )}

      <div className="border-t border-rule">
        <Dim k="Pain it solves"            roman="i."   v={<>{chosen.painPointSummary}</>} />
        <Dim k="Layer A signal"            roman="ii."  v={layerARow} />
        <Dim k="Layer B signal"            roman="iii." v={layerBRow} />
        <Dim k="Fit to your outcome"       roman="iv."  v={renderFitRow()} />
        <Dim k="What synthesis produces"   roman="v."   v={renderProducesRow()} last />
      </div>
    </main>
  );
}

function Dim({
  k,
  roman,
  v,
  last,
}: {
  k:     string;
  roman: string;
  v:     React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`grid grid-cols-1 gap-3 py-5 lg:grid-cols-[160px_1fr] lg:gap-6 ${last ? '' : 'border-b border-rule'}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        <span className="mr-1.5 font-serif text-[16px] not-italic italic tracking-[-0.01em] text-accent">
          {roman}
        </span>
        {k}
      </div>
      <div className="text-[15.5px] leading-[1.55] text-fg-2 [&_b]:font-medium [&_b]:text-fg [&_.acc]:font-serif [&_.acc]:italic [&_.acc]:text-[16px] [&_.acc]:text-accent">
        {v}
      </div>
    </div>
  );
}

function renderLayerARow(a: NonNullable<ChosenOpportunitySnapshot['layerASummary']>): React.ReactNode {
  const dims = [
    { label: 'Market reality',  conf: a.marketReality.confidence,  text: a.marketReality.reasoning },
    { label: 'Customer access', conf: a.customerAccess.confidence, text: a.customerAccess.reasoning },
    { label: 'Will people pay', conf: a.willPeoplePay.confidence,  text: a.willPeoplePay.reasoning },
    { label: 'Market size',     conf: a.marketSize.confidence,     text: a.marketSize.reasoning },
  ];
  const verified = dims.filter((d) => d.conf >= 0.7).length;
  const lead = [...dims].sort((x, y) => y.conf - x.conf)[0];
  return (
    <>
      <b>{lead.label}:</b> {truncate(lead.text, 180)}{' '}
      <span className="acc">Verified across {verified} of 4 dimensions.</span>
    </>
  );
}

function renderLayerBRow(b: NonNullable<ChosenOpportunitySnapshot['layerBSummary']>): React.ReactNode {
  const { positive, neutral, negative } = b.sentimentBreakdown;
  const total = positive + neutral + negative;
  return (
    <>
      <b>{positive} of {total} responses</b> said yes; {negative} contradicted, {neutral} were adjacent.{' '}
      <span className="acc">{VALIDATION_STRENGTH_LABELS[b.validationStrength]}.</span>
      {b.keyQuotes.length > 0 && (
        <> One founder quote: <em className="font-serif italic text-fg">&ldquo;{truncate(b.keyQuotes[0], 120)}&rdquo;</em></>
      )}
    </>
  );
}

function renderFitRow(): React.ReactNode {
  return (
    <>
      Sits inside the <b>Stage I outcome envelope</b> and leans on your{' '}
      <b>strong skills</b> from Stage II — the synthesis will pace the roadmap to your derived hours and avoid the skills you marked weak.
    </>
  );
}

function renderProducesRow(): React.ReactNode {
  return (
    <>
      A normal <b>Recommendation</b> — phased roadmap, first three steps, risks, assumptions, what would make this wrong. Same shape as standard Discovery. <span className="acc">Pushback-able for ten rounds.</span>
    </>
  );
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
