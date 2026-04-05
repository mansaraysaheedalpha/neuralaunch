// src/lib/validation/page-generator.ts
import 'server-only';
import { generateObject } from 'ai';
import { anthropic as aiSdkAnthropic } from '@ai-sdk/anthropic';
import { logger } from '@/lib/logger';
import { MODELS } from '@/lib/discovery/constants';
import { LAYOUT_VARIANTS, type LayoutVariant } from './constants';
import {
  ValidationPageContentSchema,
  type ValidationPageContent,
} from './schemas';
import type { DiscoveryContext } from '@/lib/discovery/context-schema';
import type { AudienceType } from '@/lib/discovery/constants';
import type { Recommendation } from '@/lib/discovery/recommendation-schema';
import type { Roadmap } from '@/lib/roadmap/roadmap-schema';

// ---------------------------------------------------------------------------
// Slug generator — readable, URL-safe, derived from recommendation path
// ---------------------------------------------------------------------------

/**
 * Generates a readable URL slug from the recommendation path.
 * e.g. "Productised SEO Consulting in Accra" → "productised-seo-consulting-accra-a1b2"
 */
export function generateSlug(path: string): string {
  const base = path
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48)
    .replace(/-$/, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Layout variant selector — auto-selected, never user-chosen
// ---------------------------------------------------------------------------

/**
 * Selects the layout variant from the recommendation path.
 * The variant controls structure and analytics-safe class names.
 * Three variants: product, service, marketplace.
 */
export function selectLayoutVariant(
  path:         string,
  audienceType: AudienceType | null,
): LayoutVariant {
  const lower = path.toLowerCase();

  // Marketplace/community signals
  if (/marketplace|directory|community|platform.*connect|two.sid/i.test(lower)) {
    return LAYOUT_VARIANTS.MARKETPLACE;
  }

  // Service signals — consulting, agency, freelance, productised
  if (/consult|agenc|freelan|service|coach|mentor|productis|advisor/i.test(lower)) {
    return LAYOUT_VARIANTS.SERVICE;
  }

  // Audience-type fallbacks when path is ambiguous
  if (audienceType === 'ESTABLISHED_OWNER') return LAYOUT_VARIANTS.SERVICE;

  // Default: product (software, platform, tool, app, SaaS)
  return LAYOUT_VARIANTS.PRODUCT;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface PageGenerationInput {
  recommendation: Recommendation;
  context:        DiscoveryContext;
  audienceType:   AudienceType | null;
  roadmap:        Roadmap;
  sessionId:      string;
}

export interface PageGenerationResult {
  content:       ValidationPageContent;
  layoutVariant: LayoutVariant;
  slug:          string;
}

/**
 * generateValidationPage
 *
 * Takes a fully loaded recommendation + roadmap + belief state and produces
 * a structured ValidationPageContent object validated against the Zod schema.
 * Also selects the layout variant and generates the URL slug.
 *
 * Uses Claude Sonnet 4.6 — the content task is structured and bounded,
 * not requiring deep synthesis reasoning.
 */
export async function generateValidationPage(
  input:     PageGenerationInput,
  sessionId: string,
): Promise<PageGenerationResult> {
  const log = logger.child({ module: 'PageGenerator', sessionId });

  const { recommendation, context, audienceType, roadmap } = input;

  const layoutVariant = selectLayoutVariant(recommendation.path, audienceType);
  const slug          = generateSlug(recommendation.path);

  // Build context summary for the prompt
  const contextFacts = [
    context.primaryGoal?.value      ? `Goal: ${String(context.primaryGoal.value)}` : null,
    context.situation?.value        ? `Situation: ${String(context.situation.value)}` : null,
    context.geographicMarket?.value ? `Market: ${String(context.geographicMarket.value)}` : null,
    context.technicalAbility?.value ? `Technical ability: ${String(context.technicalAbility.value)}` : null,
    context.availableBudget?.value  ? `Budget: ${String(context.availableBudget.value)}` : null,
  ].filter(Boolean).join('\n');

  const featureList = roadmap.phases
    .flatMap(phase => phase.tasks)
    .map((task, i) => `- Task ${i}: ${task.title} — ${task.description}`)
    .join('\n');

  log.info('Page generation starting', { sessionId, layoutVariant, slug });

  const { object } = await generateObject({
    model:  aiSdkAnthropic(MODELS.INTERVIEW), // Sonnet 4.6
    schema: ValidationPageContentSchema,
    messages: [{
      role:    'user',
      content: `You are generating the content for a validation landing page for a startup idea.
The goal of the page is to attract the founder's first 50 potential users and measure which specific features they are most interested in.

RECOMMENDED PATH:
${recommendation.path}

RECOMMENDATION SUMMARY:
${recommendation.summary}

FOUNDER CONTEXT:
${contextFacts}

AUDIENCE TYPE: ${audienceType ?? 'unknown'}

ROADMAP FEATURES (these become the feature interest cards — one card per task):
${featureList}

LAYOUT VARIANT: ${layoutVariant}

Generate the full page content. Rules:
- Write in plain language the target user understands — no startup jargon, no corporate speak
- The headline must name the problem or the user, not the product
- The problem statement must use specific, concrete language from the founder context above
- Each feature card must clearly explain what it does and what the user gets — not what it is called
- The CTA must feel low-commitment — this is a waitlist, not a purchase
- Survey options must be specific enough that the responses are useful signal, not generic categories
- The entry and exit surveys should produce actionable data, not vanity metrics
- metaTitle and metaDescription must be suitable for sharing on WhatsApp and LinkedIn

Do not invent facts. Use only what is provided above.`,
    }],
  });

  log.info('Page generation complete', { sessionId, slug, featureCount: object.features.length });

  return { content: object, layoutVariant, slug };
}
