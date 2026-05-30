'use client';
// src/components/institute/no-idea/OpportunityFocus.tsx
//
// Full-page focus overlay for one opportunity in the Stage 4 docket.
// Fixed inset-0; opens when a docket row is clicked. Esc closes;
// ←/→ navigate between opportunities without closing the overlay.
//
// The BODY of the focus is rendered by the consumer (Stage4Chat passes
// the existing OpportunityEvaluationView, which composes LayerASection
// / LayerBSection / VerdictSection — every transport intact). This
// shell is concerned with the chrome + keyboard navigation only.

import { useEffect, type ReactNode } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { OpportunityEvaluation } from '@/lib/ideation/stage4-opportunities/schema';
import { VALIDATION_STRENGTH_LABELS } from '@/components/ideation/stage4/labels';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export interface OpportunityFocusProps {
  /** Index of the currently-focused opportunity in the docket. null = closed. */
  index:          number | null;
  opportunities:  OpportunityEvaluation[];
  onClose:        () => void;
  onNavigate:     (nextIndex: number) => void;
  children:       ReactNode;
}

export function OpportunityFocus({
  index,
  opportunities,
  onClose,
  onNavigate,
  children,
}: OpportunityFocusProps) {
  const open = index !== null && index >= 0 && index < opportunities.length;
  const opp = open ? opportunities[index] : null;

  // Keyboard nav — Esc closes, ←/→ moves between opportunities while
  // the overlay is open. Bound at the document level so any focused
  // child element doesn't swallow the key.
  useEffect(() => {
    // Hoist the narrowed value into a const local with an explicit
    // `number` annotation. TS does not carry the outer guard's
    // narrowing into the nested `onKey` function because closures
    // re-widen captured values, so the explicit annotation makes the
    // captured type non-nullable. The `!` is sound here — the outer
    // guard returns before reaching this line whenever `index` is null.
    if (!open || index === null) return;
    const idx: number = index;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // Skip arrow navigation when focus is in a text input — otherwise
      // the founder typing in the pushback textarea would unintentionally
      // jump opportunities. Document.activeElement narrows safely.
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const inEditable =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      if (inEditable) return;
      if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault();
        onNavigate(idx - 1);
      } else if (e.key === 'ArrowRight' && idx < opportunities.length - 1) {
        e.preventDefault();
        onNavigate(idx + 1);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, index, opportunities.length, onClose, onNavigate]);

  // Lock body scroll while the overlay is open — same pattern shadcn
  // dialogs use. Prevents background scroll bleed under the fixed inset.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open || !opp) return null;

  const validationStamp = opp.layerBExtractedSignal
    ? `${signalDots(opp.layerBExtractedSignal.validationStrength)} ${VALIDATION_STRENGTH_LABELS[opp.layerBExtractedSignal.validationStrength]}`
    : '○○○○ Not run';

  const canPrev = index > 0;
  const canNext = index < opportunities.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Opportunity ${ROMAN[index] ?? index + 1}`}
      className="fixed inset-0 z-[100] flex flex-col bg-bg"
    >
      {/* Focus top bar */}
      <div className="flex h-14 items-center justify-between border-b border-rule px-6 font-mono text-[11px] uppercase tracking-[0.14em] text-muted sm:px-12">
        <span>
          Opportunity · <span className="text-fg">{ROMAN[index] ?? index + 1}</span> · Stage IV
          <span className="ml-3 text-muted-2">{index + 1} of {opportunities.length}</span>
        </span>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => canPrev && onNavigate(index - 1)}
            disabled={!canPrev}
            aria-label="Previous opportunity"
            className="inline-flex items-center gap-1.5 border border-rule-strong px-2.5 py-1.5 text-fg transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft aria-hidden="true" className="size-3" />
            ←
          </button>
          <button
            type="button"
            onClick={() => canNext && onNavigate(index + 1)}
            disabled={!canNext}
            aria-label="Next opportunity"
            className="inline-flex items-center gap-1.5 border border-rule-strong px-2.5 py-1.5 text-fg transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            →
            <ChevronRight aria-hidden="true" className="size-3" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close focus view"
            className="inline-flex items-center gap-1.5 border border-rule-strong px-3 py-1.5 text-fg transition-colors hover:border-accent hover:text-accent"
          >
            <X aria-hidden="true" className="size-3" />
            Esc · close
          </button>
        </div>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-6 pb-20 pt-12 sm:px-12 lg:px-20">
        <div className="mx-auto max-w-[1100px]">
          {/* Header */}
          <header className="mb-9 grid grid-cols-1 items-baseline gap-6 border-b border-rule pb-5 lg:grid-cols-[auto_1fr_auto] lg:gap-8">
            <div className="font-serif text-[72px] italic leading-[0.9] tracking-[-0.02em] text-accent">
              {ROMAN[index] ?? index + 1}.
            </div>
            <h2 className="font-sans text-fg [font-size:clamp(28px,4vw,48px)] [font-weight:500] [line-height:1.05] [letter-spacing:-0.025em]">
              {opp.painPointSummary}
              <span className="mt-2 block font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                Pain · stage III shortlist
              </span>
            </h2>
            <div className="text-right font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
              Validation
              <span className="mt-1.5 block font-serif text-[20px] italic normal-case tracking-[-0.01em] text-accent">
                {validationStamp}
              </span>
            </div>
          </header>

          {children}
        </div>
      </div>
    </div>
  );
}

function signalDots(strength: 'strong' | 'mixed' | 'weak' | 'contradictory'): string {
  switch (strength) {
    case 'strong':        return '●●●●';
    case 'mixed':         return '●●●○';
    case 'weak':          return '●●○○';
    case 'contradictory': return '●○○○';
  }
}
