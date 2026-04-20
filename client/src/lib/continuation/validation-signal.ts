// src/lib/continuation/validation-signal.ts
//
// Aggregates every ValidationPage under a Venture (Recommendation →
// Cycle → Venture) into a single signal summary that the continuation
// brief generator references in its Opus prompt. Kept in its own file
// to keep brief-generator.ts under the 300-line cap — the shape is
// re-exported from brief-generator.ts for a stable import surface.

import 'server-only';
import prisma from '@/lib/prisma';

/**
 * ValidationSignal
 *
 * Five-level strength enum mirrors ValidationReport.signalStrength
 * with an added 'absent' sentinel for "no page created yet". The
 * brief generator uses signalStrength to decide how much to reference
 * market data vs. execution data; keyMetrics and patterns are rendered
 * verbatim into the prompt so Opus can quote them back.
 */
export interface ValidationSignal {
  signalStrength: 'strong' | 'moderate' | 'weak' | 'negative' | 'absent';
  keyMetrics:     { label: string; value: string }[];
  patterns:       string[];
}

/**
 * loadValidationSignal
 *
 * Walks ValidationPage → Recommendation → Cycle → Venture to find every
 * landing page that belongs to the same venture as the current roadmap.
 * For each page, reads the most recent ValidationSnapshot (visitors,
 * unique visitors, CTA conversion) and the generated ValidationReport.
 * signalStrength when present. Aggregates into a single ValidationSignal.
 *
 * Returns null when no ValidationPage exists anywhere under the venture;
 * the brief generator then falls through to pre-signal behaviour.
 */
export async function loadValidationSignal(ventureId: string): Promise<ValidationSignal | null> {
  // OR arm: task-bound pages have recommendationId=null (the task-scoped
  // route sets roadmapId+taskId and leaves recommendationId null so the
  // @@unique([recommendationId]) constraint doesn't collide with the
  // recommendation-scoped page). Walk through the roadmap relation so
  // those pages still count toward the venture's aggregate signal.
  const pages = await prisma.validationPage.findMany({
    where: {
      OR: [
        { recommendation: { cycle: { ventureId } } },
        { roadmap:        { recommendation: { cycle: { ventureId } } } },
      ],
    },
    select: {
      id:     true,
      status: true,
      snapshots: {
        orderBy: { takenAt: 'desc' },
        take:    1,
        select: {
          visitorCount:       true,
          uniqueVisitorCount: true,
          ctaConversionRate:  true,
        },
      },
      report: { select: { signalStrength: true } },
    },
  });

  if (pages.length === 0) return null;

  let totalVisitors   = 0;
  let totalUnique     = 0;
  let weightedConvNum = 0;
  let weightedConvDen = 0;
  const rank: Record<string, number> = { negative: 4, strong: 3, moderate: 2, weak: 1 };
  let strongestReport: string | null = null;

  for (const page of pages) {
    const snap = page.snapshots[0];
    if (snap) {
      totalVisitors   += snap.visitorCount;
      totalUnique     += snap.uniqueVisitorCount;
      weightedConvNum += snap.ctaConversionRate * snap.visitorCount;
      weightedConvDen += snap.visitorCount;
    }
    const rep = page.report?.signalStrength;
    if (rep && (!strongestReport || (rank[rep] ?? 0) > (rank[strongestReport] ?? 0))) {
      strongestReport = rep;
    }
  }

  if (totalVisitors === 0 && !strongestReport) {
    return { signalStrength: 'absent', keyMetrics: [], patterns: [] };
  }

  const avgConv = weightedConvDen > 0 ? weightedConvNum / weightedConvDen : 0;

  const keyMetrics: { label: string; value: string }[] = [];
  if (totalVisitors > 0) {
    keyMetrics.push({ label: 'Visitors across all pages', value: String(totalVisitors) });
    keyMetrics.push({ label: 'Unique visitors',           value: String(totalUnique) });
    keyMetrics.push({ label: 'CTA conversion rate',       value: `${(avgConv * 100).toFixed(1)}%` });
  }
  keyMetrics.push({ label: 'Pages under this venture', value: String(pages.length) });

  let signalStrength: ValidationSignal['signalStrength'];
  if (strongestReport === 'negative')      signalStrength = 'negative';
  else if (strongestReport === 'strong')   signalStrength = 'strong';
  else if (strongestReport === 'moderate') signalStrength = 'moderate';
  else if (strongestReport === 'weak')     signalStrength = 'weak';
  else if (totalVisitors < 50)             signalStrength = 'weak';
  else if (avgConv >= 0.05)                signalStrength = 'strong';
  else if (avgConv >= 0.02)                signalStrength = 'moderate';
  else                                     signalStrength = 'weak';

  const patterns: string[] = [];
  if (totalVisitors >= 100 && avgConv < 0.01) {
    patterns.push('Traffic arrived but almost nobody converted — interest without commitment.');
  }
  if (signalStrength === 'negative') {
    patterns.push('Validation report rated the signal as negative — the market actively said no.');
  }
  if (totalVisitors > 0 && totalUnique < totalVisitors * 0.5) {
    patterns.push('High repeat-visit ratio — visitors are returning to re-read before deciding.');
  }

  return { signalStrength, keyMetrics, patterns };
}

/**
 * renderValidationSignalBlock
 *
 * Shapes the signal into a compact block the Opus prompt quotes back.
 * Returns an empty string when the signal is undefined (pre-lifecycle
 * roadmaps); returns an explicit "no page created" line when present
 * but absent, so the agent knows not to invent data.
 */
export function renderValidationSignalBlock(signal: ValidationSignal | null | undefined): string {
  if (!signal) return '';
  if (signal.signalStrength === 'absent') {
    return 'VALIDATION SIGNAL: no validation landing page was created for this venture. The brief below is grounded only in execution evidence; do not invent a market signal.\n\n';
  }
  const lines: string[] = [`VALIDATION SIGNAL (strength: ${signal.signalStrength.toUpperCase()}):`];
  for (const m of signal.keyMetrics) lines.push(`  - ${m.label}: ${m.value}`);
  for (const p of signal.patterns)   lines.push(`  - Pattern: ${p}`);
  return lines.join('\n') + '\n\n';
}
