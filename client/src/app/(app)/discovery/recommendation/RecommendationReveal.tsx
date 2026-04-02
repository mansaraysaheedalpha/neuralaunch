// src/app/(app)/discovery/recommendation/RecommendationReveal.tsx
'use client';

import { motion } from 'motion/react';

interface Props {
  recommendation: {
    id:                     string;
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

type RiskRow   = { risk: string; mitigation: string };
type AltRow    = { alternative: string; whyNotForThem: string };

/**
 * RecommendationReveal
 *
 * Client Component — animates in the structured recommendation.
 * Sections reveal sequentially to direct the reader's attention.
 */
export function RecommendationReveal({ recommendation: r }: Props) {
  const steps       = r.firstThreeSteps as string[];
  const risks       = r.risks as RiskRow[];
  const assumptions = r.assumptions as string[];
  const alt         = r.alternativeRejected as AltRow;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">

        {/* Path */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Your Path</p>
          <h2 className="text-xl font-semibold text-foreground leading-snug">{r.path}</h2>
        </motion.div>

        {/* Reasoning */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Why This Fits You</p>
          <p className="text-sm text-foreground/90 leading-relaxed">{r.reasoning}</p>
        </motion.div>

        {/* First 3 Steps */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">First Three Steps</p>
          <ol className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.12 }}
                className="flex gap-3 text-sm"
              >
                <span className="flex-shrink-0 size-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">
                  {i + 1}
                </span>
                <span className="text-foreground/90 leading-relaxed pt-0.5">{step}</span>
              </motion.li>
            ))}
          </ol>
        </motion.div>

        {/* Timeline */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Time to First Result</p>
          <p className="text-sm font-medium text-foreground">{r.timeToFirstResult}</p>
        </motion.div>

        {/* Risks */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85 }}>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Risks & Mitigations</p>
          <div className="flex flex-col gap-3">
            {risks.map((row, i) => (
              <div key={i} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium text-foreground mb-1">{row.risk}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">{row.mitigation}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Assumptions */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Assumptions</p>
          <ul className="flex flex-col gap-1.5">
            {assumptions.map((a, i) => (
              <li key={i} className="text-sm text-foreground/80 flex gap-2">
                <span className="text-muted-foreground">—</span>{a}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* What Would Make This Wrong */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">What Would Make This Wrong</p>
          <p className="text-sm text-foreground/80 leading-relaxed italic">{r.whatWouldMakeThisWrong}</p>
        </motion.div>

        {/* Alternative Rejected */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Alternative Considered & Rejected</p>
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium text-foreground mb-1">{alt.alternative}</p>
            <p className="text-muted-foreground text-xs leading-relaxed">{alt.whyNotForThem}</p>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
