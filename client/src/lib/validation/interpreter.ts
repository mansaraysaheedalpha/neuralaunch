// src/lib/validation/interpreter.ts
import 'server-only';
import { generateObject }    from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { logger }            from '@/lib/logger';
import { MODELS }            from '@/lib/discovery/constants';
import {
  ValidationInterpretationSchema,
  type ValidationInterpretation,
  type FeatureCard,
} from './schemas';
import type { RawMetrics }   from './metrics-collector';
import {
  VALIDATION_SYNTHESIS_THRESHOLDS,
} from './constants';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface InterpretInput {
  slug:           string;
  pageId:         string;
  metrics:        RawMetrics;
  features:       FeatureCard[];  // from the ValidationPage content
  publishedAt:    Date;
  briefChannels:  number;         // total in distribution brief
  completedChannels: number;      // channels the founder has ticked off
}

/**
 * interpretValidationMetrics
 *
 * Sonnet Step 1 interpretation pass. Runs on every ValidationSnapshot.
 * Converts raw metrics into a concise, founder-facing reading:
 *   - signalStrength: strong | moderate | weak | insufficient
 *   - per-feature ranking with assessment labels
 *   - conversion/ traffic assessments in one sentence each
 *   - survey themes extracted in the user's own words
 *   - a specific next action (never generic)
 *
 * This is deliberately cheap (Sonnet, structured output, no extended thinking).
 * The expensive Opus build-brief pass is gated behind minimum signal thresholds
 * and only runs in Step 12.
 */
export async function interpretValidationMetrics(
  input: InterpretInput,
): Promise<ValidationInterpretation> {
  const log = logger.child({ module: 'ValidationInterpreter', pageId: input.pageId });

  const {
    metrics, features, publishedAt, briefChannels, completedChannels,
  } = input;

  const daysLive = Math.max(
    0,
    Math.floor((Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24)),
  );

  const belowMinVisitors = metrics.visitorCount < VALIDATION_SYNTHESIS_THRESHOLDS.MIN_VISITORS_FOR_BRIEF;
  const lowTraffic       = belowMinVisitors && daysLive >= VALIDATION_SYNTHESIS_THRESHOLDS.DAYS_BEFORE_LOW_TRAFFIC_WARNING;

  const featureList = features
    .map(f => `- ${f.taskId}: ${f.title} — ${f.description}`)
    .join('\n');

  const featureClickList = metrics.featureClicks.length > 0
    ? metrics.featureClicks
        .map(c => `- ${c.taskId} (${c.title}): ${c.clicks} clicks`)
        .join('\n')
    : '(no feature clicks yet)';

  const surveyList = metrics.surveyResponses.length > 0
    ? metrics.surveyResponses
        .map(s => `- Q: ${s.question}\n  A: ${s.answer}`)
        .join('\n')
    : '(no survey responses yet)';

  log.info('Interpretation starting', {
    visitorCount:      metrics.visitorCount,
    featureClickCount: metrics.featureClicks.reduce((sum, c) => sum + c.clicks, 0),
    surveyCount:       metrics.surveyResponses.length,
    daysLive,
  });

  const { object } = await generateObject({
    model:  aiSdkAnthropic(MODELS.INTERVIEW), // Sonnet 4.6
    schema: ValidationInterpretationSchema,
    messages: [{
      role: 'user',
      content: `You are interpreting the latest analytics snapshot for a founder's validation landing page.
Your job is to turn raw numbers into an honest, specific reading the founder can act on immediately.

PAGE CONTEXT:
- Slug: ${input.slug}
- Published: ${daysLive} days ago
- Distribution brief: ${completedChannels}/${briefChannels} channels shared

RAW METRICS:
- Total visitors:          ${metrics.visitorCount}
- Unique visitors:         ${metrics.uniqueVisitorCount}
- CTA conversion rate:     ${(metrics.ctaConversionRate * 100).toFixed(1)}%
- Below threshold (<${VALIDATION_SYNTHESIS_THRESHOLDS.MIN_VISITORS_FOR_BRIEF} visitors): ${belowMinVisitors}
- Low-traffic warning:     ${lowTraffic}

PAGE FEATURES (one card per task):
${featureList}

FEATURE CLICKS:
${featureClickList}

SURVEY RESPONSES (raw user words):
${surveyList}

TRAFFIC SOURCES:
${metrics.trafficSources.length > 0 ? metrics.trafficSources.map(t => `- ${t.source}: ${t.count}`).join('\n') : '(none yet)'}

SCROLL DEPTH:
${metrics.scrollDepthData.length > 0 ? metrics.scrollDepthData.map(d => `- ${d.depth}%: ${d.reachedPercentage}% reached`).join('\n') : '(none yet)'}

RULES:
1. signalStrength must be "insufficient" when visitor count is below the threshold AND the founder has not yet shared all channels. Do not declare weak signal on a page nobody has seen.
2. signalStrength "weak" means real traffic arrived but interest was not clearly expressed.
3. signalStrength "moderate" means clear interest in at least one feature and meaningful survey themes.
4. signalStrength "strong" requires distinct feature winners AND conversion above typical waitlist baseline (~5%).
5. featureRanking must be ordered by clicks descending and include EVERY feature on the page, even those with 0 clicks.
6. surveyThemes must quote users' actual language — do not paraphrase into generic categories.
7. nextAction must be a single specific instruction, tied to the current state. Examples:
   - If below visitor threshold + incomplete distribution: "Share the page in your remaining channels (${briefChannels - completedChannels} left) before anything else."
   - If below visitor threshold + distribution complete + low-traffic warning: "Your distribution reached its limit — try posting in [specific alternative] where your target user also spends time."
   - If strong interest in one feature: "Double down on [feature title] — mention it first in your next post."
   Never say generic things like "keep sharing" or "wait for more data".
8. conversionAssessment and trafficAssessment must each be exactly ONE sentence.
9. signalReason must cite the actual number behind the score.

Do not invent data. Use only the numbers above.`,
    }],
  });

  log.info('Interpretation complete', {
    signalStrength: object.signalStrength,
    featureRankingCount: object.featureRanking.length,
  });

  return object;
}
