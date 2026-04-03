// src/app/(app)/discovery/recommendation/RecommendationReveal.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ThumbsDown } from 'lucide-react';

interface Props {
  recommendation: {
    id:                     string;
    summary:                string;
    path:                   string;
    reasoning:              string;
    firstThreeSteps:        unknown;
    timeToFirstResult:      string;
    risks:                  unknown;
    assumptions:            unknown;
    whatWouldMakeThisWrong: string;
    alternativeRejected:    unknown;
    createdAt:              Date;
  };
}

type RiskRow = { risk: string; mitigation: string };
type AltRow  = { alternative: string; whyNotForThem: string };

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------

function Section({
  label,
  delay = 0,
  children,
}: {
  label:    string;
  delay?:   number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full group mb-2"
      >
        <p className="text-xs uppercase tracking-widest text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
          {label}
        </p>
        <ChevronDown
          className={`size-3.5 text-muted-foreground/50 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Assumption row with inline flag
// ---------------------------------------------------------------------------

function AssumptionRow({ text }: { text: string }) {
  const [flagged, setFlagged] = useState(false);

  return (
    <li className="text-sm text-foreground/80 flex gap-2 items-start">
      <span className="text-muted-foreground mt-0.5">—</span>
      <span className="flex-1 leading-relaxed">{text}</span>
      <button
        onClick={() => setFlagged(f => !f)}
        title="This doesn't apply to me"
        className={`flex-shrink-0 mt-0.5 p-0.5 rounded transition-colors ${
          flagged
            ? 'text-destructive'
            : 'text-muted-foreground/30 hover:text-muted-foreground'
        }`}
      >
        <ThumbsDown className="size-3" />
      </button>
      {flagged && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full text-xs text-muted-foreground italic mt-1 ml-4 leading-relaxed"
        >
          If this doesn&apos;t apply to you, it may change the recommended path.{' '}
          <a href="/discovery" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Refine your answers →
          </a>
        </motion.p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * RecommendationReveal
 *
 * Client Component — renders the structured recommendation with:
 * - Always-visible committed summary block at the top
 * - "What Would Make This Wrong" immediately after summary
 * - All remaining sections individually collapsible (expanded by default)
 * - Inline assumption flag with contextual follow-up
 */
export function RecommendationReveal({ recommendation: r }: Props) {
  const steps       = r.firstThreeSteps as string[];
  const risks       = r.risks as RiskRow[];
  const assumptions = r.assumptions as string[];
  const alt         = r.alternativeRejected as AltRow;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">

        {/* Committed summary — always visible, visually distinct */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4"
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/70 mb-2">
            Your Recommendation
          </p>
          <p className="text-sm text-foreground leading-relaxed">{r.summary}</p>
        </motion.div>

        {/* What Would Make This Wrong — directly after summary */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <p className="text-xs uppercase tracking-widest text-muted-foreground/70 mb-2">
            What Would Make This Wrong
          </p>
          <p className="text-sm text-foreground/80 leading-relaxed italic">{r.whatWouldMakeThisWrong}</p>
        </motion.div>

        {/* Path */}
        <Section label="Your Path" delay={0.3}>
          <h2 className="text-xl font-semibold text-foreground leading-snug">{r.path}</h2>
        </Section>

        {/* Reasoning */}
        <Section label="Why This Fits You" delay={0.4}>
          <p className="text-sm text-foreground/90 leading-relaxed">{r.reasoning}</p>
        </Section>

        {/* First 3 Steps */}
        <Section label="First Three Steps" delay={0.5}>
          <ol className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex-shrink-0 size-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">
                  {i + 1}
                </span>
                <span className="text-foreground/90 leading-relaxed pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </Section>

        {/* Timeline */}
        <Section label="Time to First Result" delay={0.6}>
          <p className="text-sm font-medium text-foreground">{r.timeToFirstResult}</p>
        </Section>

        {/* Risks */}
        <Section label="Risks & Mitigations" delay={0.7}>
          <div className="flex flex-col gap-3">
            {risks.map((row, i) => (
              <div key={i} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium text-foreground mb-1">{row.risk}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">{row.mitigation}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Assumptions */}
        <Section label="Assumptions" delay={0.8}>
          <ul className="flex flex-col gap-2">
            {assumptions.map((a, i) => (
              <AssumptionRow key={i} text={a} />
            ))}
          </ul>
        </Section>

        {/* Alternative Considered & Rejected */}
        <Section label="Alternative Considered & Rejected" delay={0.9}>
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium text-foreground mb-1">{alt.alternative}</p>
            <p className="text-muted-foreground text-xs leading-relaxed">{alt.whyNotForThem}</p>
          </div>
        </Section>

      </div>
    </div>
  );
}
