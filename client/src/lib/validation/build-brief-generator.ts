// src/lib/validation/build-brief-generator.ts
import 'server-only';
import { generateObject }              from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { logger }                      from '@/lib/logger';
import { MODELS }                      from '@/lib/discovery/constants';
import {
  ValidationReportSchema,
  type ValidationReport,
  type ValidationInterpretation,
  type FeatureCard,
} from './schemas';
import type { RawMetrics }             from './metrics-collector';
import type { Recommendation }        from '@/lib/discovery/recommendation-schema';

// ---------------------------------------------------------------------------
// Threshold gate — enforced before the Opus call is allowed
// ---------------------------------------------------------------------------

import { VALIDATION_SYNTHESIS_THRESHOLDS } from './constants';

export interface ThresholdGateInput {
  metrics: RawMetrics;
}

export interface ThresholdGateResult {
  passes:  boolean;
  reasons: string[];
}

/**
 * canGenerateBuildBrief
 *
 * The gate that decides whether we burn an Opus call on a build brief.
 * All four conditions must be met. Returns a list of failure reasons for
 * logging/debugging when the gate rejects.
 */
export function canGenerateBuildBrief({ metrics }: ThresholdGateInput): ThresholdGateResult {
  const reasons: string[] = [];

  if (metrics.visitorCount < VALIDATION_SYNTHESIS_THRESHOLDS.MIN_VISITORS_FOR_BRIEF) {
    reasons.push(`visitorCount ${metrics.visitorCount} < ${VALIDATION_SYNTHESIS_THRESHOLDS.MIN_VISITORS_FOR_BRIEF}`);
  }

  const totalFeatureClicks = metrics.featureClicks.reduce((sum, c) => sum + c.clicks, 0);
  if (totalFeatureClicks < VALIDATION_SYNTHESIS_THRESHOLDS.MIN_FEATURE_CLICKS_FOR_BRIEF) {
    reasons.push(`featureClicks ${totalFeatureClicks} < ${VALIDATION_SYNTHESIS_THRESHOLDS.MIN_FEATURE_CLICKS_FOR_BRIEF}`);
  }

  if (metrics.surveyResponses.length < VALIDATION_SYNTHESIS_THRESHOLDS.MIN_SURVEY_RESPONSES_FOR_SYNTHESIS) {
    reasons.push(`surveyResponses ${metrics.surveyResponses.length} < ${VALIDATION_SYNTHESIS_THRESHOLDS.MIN_SURVEY_RESPONSES_FOR_SYNTHESIS}`);
  }

  return { passes: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface BuildBriefInput {
  pageId:         string;
  slug:           string;
  metrics:        RawMetrics;
  interpretation: ValidationInterpretation;
  features:       FeatureCard[];
  recommendation: Pick<Recommendation, 'path' | 'summary'>;
}

/**
 * generateBuildBrief
 *
 * Opus Step 2 — the committed build recommendation. Runs only when
 * canGenerateBuildBrief() passes. Produces a ValidationReport with:
 *   - signalStrength (strong | moderate | weak — not 'insufficient': if it were
 *     insufficient the gate would have stopped us)
 *   - confirmedFeatures: evidence-backed list of what to build
 *   - rejectedFeatures: what to cut and why
 *   - surveyInsights: users' own words, unparaphrased
 *   - buildBrief: one committed paragraph — no hedging
 *   - nextAction: the single most important 48-hour move
 *
 * This is the agent that turns validation data into a product decision.
 * It must commit. "It depends" is not an acceptable output.
 */
export async function generateBuildBrief(
  input: BuildBriefInput,
): Promise<ValidationReport> {
  const log = logger.child({ module: 'BuildBriefGenerator', pageId: input.pageId });

  const { metrics, interpretation, features, recommendation } = input;

  const featureList = features
    .map(f => `- ${f.taskId}: ${f.title} — ${f.description} (benefit: ${f.benefit})`)
    .join('\n');

  const clickAggregate = metrics.featureClicks
    .sort((a, b) => b.clicks - a.clicks)
    .map(c => `- ${c.taskId} (${c.title}): ${c.clicks} clicks`)
    .join('\n');

  const surveyList = metrics.surveyResponses
    .map(s => `- "${s.answer}" (Q: ${s.question})`)
    .join('\n');

  const rankedFeatures = interpretation.featureRanking
    .map(f => `- ${f.taskId} (${f.title}): ${f.clicks} clicks, ${f.percentage}% share, assessment: ${f.assessment}`)
    .join('\n');

  log.info('Generating build brief', {
    visitorCount: metrics.visitorCount,
    totalClicks:  metrics.featureClicks.reduce((s, c) => s + c.clicks, 0),
    surveyCount:  metrics.surveyResponses.length,
  });

  const { object } = await generateObject({
    model:  aiSdkAnthropic(MODELS.SYNTHESIS), // Opus 4.6 — commit-grade reasoning
    schema: ValidationReportSchema,
    messages: [{
      role: 'user',
      content: `You are writing the committed build brief for a founder who has just collected enough validation data to make a product decision.
This is the handoff from "idea" to "build" — what you output becomes the feature specification for their MVP.

ORIGINAL RECOMMENDATION:
- Path: ${recommendation.path}
- Summary: ${recommendation.summary}

PAGE FEATURES OFFERED:
${featureList}

VALIDATION METRICS:
- Total visitors:       ${metrics.visitorCount}
- Unique visitors:      ${metrics.uniqueVisitorCount}
- CTA conversion:       ${(metrics.ctaConversionRate * 100).toFixed(1)}%

FEATURE CLICK AGGREGATE:
${clickAggregate}

FEATURE RANKING (from Step 1 interpretation):
${rankedFeatures}

SURVEY RESPONSES (users' own words):
${surveyList}

STEP 1 NEXT ACTION (do not copy — you must produce a more committed one):
${interpretation.nextAction}

STEP 1 SURVEY THEMES:
${interpretation.surveyThemes.join(' | ')}

RULES:
1. signalStrength is one of 'strong' | 'moderate' | 'weak' — never 'insufficient' (we passed the gate to reach this step).
2. confirmedFeatures must include ONLY features with measurable interest. Rank by clicks descending. Each needs an evidence sentence citing the specific number AND a survey quote when one supports it.
3. rejectedFeatures must include EVERY feature with zero or near-zero clicks. Each needs a plain-language reason grounded in the actual data — never hedged.
4. surveyInsights: quote users verbatim. Do NOT paraphrase into corporate language. If users said "I'm tired of chasing invoices," write exactly that, not "users express frustration with cash flow management."
5. buildBrief: ONE committed paragraph. State what to build first, what to defer, what to cut. No "it depends", no "consider", no "you might want to". Use directive language: "Build X. Defer Y. Cut Z."
6. nextAction: the single most important 48-hour move. Not "keep validating" — something specific like "Message the 12 people who signed up and offer a 30-minute call to the first 5 who reply."
7. Never invent numbers. Every claim must trace back to the data above.
8. If the signal contradicts the original recommendation path, say so plainly in the buildBrief. The founder needs to know.`,
    }],
  });

  log.info('Build brief generated', {
    signalStrength:       object.signalStrength,
    confirmedCount:       object.confirmedFeatures.length,
    rejectedCount:        object.rejectedFeatures.length,
  });

  return object;
}
