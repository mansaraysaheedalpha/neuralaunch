'use client';

import { AlertCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import type { Constraint } from '@/lib/ideation/stage2-requirements/schema';
import { SKILL_LABELS, TIER_LABEL } from './labels';

interface ConstraintsListProps {
  constraints: Constraint[];
}

/**
 * Read-only render of computed constraints grouped by severity.
 * Implication strings come from the composer's prose pass; empty
 * implications are surfaced explicitly so reviewers can flag
 * generation failures.
 *
 * TODO(copy): final wording on the group headers + empty state
 * pending product-voice approval.
 */
export function ConstraintsList({ constraints }: ConstraintsListProps) {
  if (constraints.length === 0) {
    return (
      <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
        No skill constraints surfaced — your inventory meets every requirement in the Expected Profile.
      </div>
    );
  }

  const blind = constraints.filter(c => c.gap === 'blind_spot');
  const structural = constraints.filter(c => c.gap === 'structural');
  const mild = constraints.filter(c => c.gap === 'mild');

  return (
    <div className="space-y-4">
      {blind.length > 0 && (
        <ConstraintGroup
          icon={<HelpCircle className="size-4 text-accent" />}
          label="Blind spots"
          subtitle="Required skills where neither you nor your team have a self-assessed level yet."
          items={blind}
          accent="border-accent/30 bg-accent/5"
        />
      )}
      {structural.length > 0 && (
        <ConstraintGroup
          icon={<AlertCircle className="size-4 text-accent" />}
          label="Structural constraints"
          subtitle="Gaps wide enough to rule out paths that depend on these skills."
          items={structural}
          accent="border-accent/30 bg-accent/5"
        />
      )}
      {mild.length > 0 && (
        <ConstraintGroup
          icon={<AlertTriangle className="size-4 text-muted" />}
          label="Mild constraints"
          subtitle="One tier below — workable, but factor in for opportunity selection."
          items={mild}
          accent="border-rule bg-bg-2/40"
        />
      )}
    </div>
  );
}

interface ConstraintGroupProps {
  icon:     React.ReactNode;
  label:    string;
  subtitle: string;
  items:    Constraint[];
  accent:   string;
}

function ConstraintGroup({ icon, label, subtitle, items, accent }: ConstraintGroupProps) {
  return (
    <section className={`rounded-lg border ${accent} px-4 py-3`}>
      <header className="flex items-start gap-2 mb-3">
        {icon}
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-fg">{label}</h3>
          <p className="text-xs text-muted mt-0.5">{subtitle}</p>
        </div>
      </header>
      <ul className="space-y-2">
        {items.map((c, i) => (
          <li key={`${c.skill}-${i}`} className="rounded-md border border-rule bg-bg/60 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-medium text-fg">
                {SKILL_LABELS[c.skill] ?? c.skill}
              </span>
              <span className="text-xs text-muted">
                {TIER_LABEL[c.actualTier] ?? c.actualTier} <span aria-hidden>→</span> needs {TIER_LABEL[c.requiredTier] ?? c.requiredTier}
                {c.critical && <span className="ml-2 text-accent">critical</span>}
              </span>
            </div>
            <p className="text-xs text-fg leading-relaxed">
              {c.implication || (
                <span className="text-muted italic">(no implication generated)</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
