'use client';
// src/components/institute/no-idea/ExpectedProfilePanel.tsx
//
// Right-rail panel summarising what the committed Stage 1 outcome
// demands. The per-row "dashed ghost marker" is rendered by SkillRow;
// this panel is the textual summary + the "push back on the profile"
// affordance. Visual grammar: stage-2.html .ep.

import type { ExpectedProfileEntry } from '@/lib/ideation/stage2-requirements/schema';
import type { SkillTier } from '@neuralaunch/constants';
import { SKILL_LABELS } from '@/components/ideation/labels';

/**
 * Three-bucket level mapping for the rail readout:
 *   good       → Strong (accent)
 *   acceptable → Medium (amber)
 *   bad        → Lower  (muted)
 *   unknown    → Lower  (muted)
 *
 * Matches the stage-2.html reference's three-level display, where the
 * tier nuance collapses to a three-step ladder for readability.
 */
const LEVEL: Record<SkillTier, { text: string; tone: string }> = {
  good:       { text: 'Strong', tone: 'text-accent' },
  acceptable: { text: 'Medium', tone: 'text-amber'  },
  bad:        { text: 'Lower',  tone: 'text-muted'  },
  unknown:    { text: 'Lower',  tone: 'text-muted'  },
};

export interface ExpectedProfilePanelProps {
  entries:    ExpectedProfileEntry[];
  /** Optional rationale paragraph, shown above the requirements list. */
  derivation?: string;
  onPushback?: () => void;
}

export function ExpectedProfilePanel({ entries, derivation, onPushback }: ExpectedProfilePanelProps) {
  if (entries.length === 0) return null;
  // Order: good (Strong) first, then acceptable, then the rest. Within
  // each level, critical first.
  const sorted = [...entries].sort((a, b) => {
    const order: Record<SkillTier, number> = { good: 0, acceptable: 1, bad: 2, unknown: 3 };
    const da = order[a.requiredTier] - order[b.requiredTier];
    if (da !== 0) return da;
    return Number(b.critical) - Number(a.critical);
  });
  return (
    <div className="border border-rule bg-bg-2 px-5 py-[18px]">
      <div className="mb-3.5 flex justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        <span>Expected profile</span>
        <span className="text-accent">Derived</span>
      </div>
      <h4 className="mb-2 font-serif text-[22px] font-normal italic leading-[1.15] tracking-[-0.01em] text-fg [&_em]:text-accent">
        What your <em>outcome</em> demands.
      </h4>
      <p className="mb-3.5 text-[13px] leading-[1.55] text-fg-2">
        {derivation
          ?? 'The skills your committed outcome leans on. The dashed marker on each canvas row is the required tier for that skill.'}
      </p>
      <div className="grid gap-2 border-t border-rule pt-3">
        {sorted.map((e) => {
          const lvl = LEVEL[e.requiredTier] ?? LEVEL.bad;
          return (
            <div key={e.skill} className="grid grid-cols-[1fr_auto] items-baseline gap-2.5 text-[12.5px] text-fg-2">
              <span>{SKILL_LABELS[e.skill]}</span>
              <span className={['font-mono text-[9.5px] uppercase tracking-[0.14em]', lvl.tone].join(' ')}>
                {lvl.text}
              </span>
            </div>
          );
        })}
      </div>
      {onPushback && (
        <button
          type="button"
          onClick={onPushback}
          className="mt-3.5 w-full border border-rule-strong px-3 py-2.5 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-fg-2 transition-colors hover:border-accent hover:text-accent"
        >
          ⚐ Push back on the profile
        </button>
      )}
    </div>
  );
}
