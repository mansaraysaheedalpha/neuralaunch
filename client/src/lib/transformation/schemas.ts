// src/lib/transformation/schemas.ts
//
// Zod schemas for the Transformation Report — the once-per-venture
// narrative the founder gets when they Mark Complete. The shape is
// intentionally dynamic: every default section is nullable, the
// model picks which sections actually have something to say, an
// extra customSections array catches asymmetric findings, and a
// sectionOrder list drives the rendered narrative flow. The result
// reads like writing, not paperwork.
//
// CLAUDE.md compliance: no .max() on strings, no .int() / .min() /
// .max() on numbers — Anthropic's structured-output validator
// rejects integer-type constraints and post-hoc parses string
// length. Constraints live in the .describe() copy and are
// enforced (where needed) by post-parse normalisation.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Default-section keys + the order schema. Listing the keys as a
// const tuple lets the sectionOrder field be typed as a real enum
// the model must satisfy.
// ---------------------------------------------------------------------------

export const DEFAULT_SECTION_KEYS = [
  'startingPoint',
  'centralChallenge',
  'decisivePivots',
  'whatYouLearned',
  'whatYouBuilt',
  'honestStruggles',
  'endingPoint',
  'closingReflection',
] as const;

export type DefaultSectionKey = typeof DEFAULT_SECTION_KEYS[number];

// ---------------------------------------------------------------------------
// Custom sections + decisive-pivot entries
// ---------------------------------------------------------------------------

export const TransformationCustomSectionSchema = z.object({
  heading: z.string().describe(
    'Section heading — short, specific, in the founder\'s domain language. Examples: "What surprised you about your customers", "The week the budget changed everything", "Why you stopped building". 4-10 words ideal.',
  ),
  body: z.string().describe(
    'Section body — written as prose addressed to the founder. Quotes from their own check-ins or recommendations are encouraged.',
  ),
});
export type TransformationCustomSection = z.infer<typeof TransformationCustomSectionSchema>;

export const TransformationDecisivePivotSchema = z.object({
  moment: z.string().describe('When the pivot happened and what triggered it. Reference specific cycle, task, or check-in moment when possible.'),
  why:    z.string().describe('Why this moment was decisive — what made it different from a routine course-correction.'),
  change: z.string().describe('What actually shifted — direction, target customer, scope, conviction, etc.'),
});
export type TransformationDecisivePivot = z.infer<typeof TransformationDecisivePivotSchema>;

// ---------------------------------------------------------------------------
// The report itself — every default section is nullable so the
// model can drop sections that have nothing real to say. The
// sectionOrder field is the source of truth for what the renderer
// actually shows; sections present in the object but missing from
// sectionOrder are dropped at render time.
// ---------------------------------------------------------------------------

export const TransformationReportSchema = z.object({
  startingPoint: z.string().nullable().describe(
    'Where the founder was when they started this venture — their situation, their constraints, what they had been trying. Quote their own opening words from the discovery interview when possible. Honest, specific. Set to null only if no meaningful starting belief state exists.',
  ),
  centralChallenge: z.string().nullable().describe(
    'The real thing they were stuck on or trying to solve at the heart of this venture. The actual problem, not the surface symptom they first described. Set to null only if the venture\'s through-line was unclear.',
  ),
  decisivePivots: z.array(TransformationDecisivePivotSchema).nullable().describe(
    '2 to 4 turning points across the venture — moments that materially changed direction, conviction, or scope. Reference specific evidence: a check-in, a fork pick, a validation result, a pushback round. Set to null or empty when the journey was linear.',
  ),
  whatYouLearned: z.string().nullable().describe(
    'Insights that compound BEYOND this specific venture — things the founder will carry into whatever comes next. Frame as durable lessons, not bullet points. Set to null only if no learning surfaces.',
  ),
  whatYouBuilt: z.string().nullable().describe(
    'Concrete outputs the founder produced — a priced offering, a list of customers contacted, a published landing page, a real conversation that led somewhere, a working MVP. Real things. Set to null when nothing concrete shipped.',
  ),
  honestStruggles: z.string().nullable().describe(
    'What was hard. What they avoided. What almost stopped them. What they had to push through. Honest, not performative — refer to specific check-ins or blocked tasks when the evidence is there. Set to null when the journey was genuinely smooth (rare).',
  ),
  endingPoint: z.string().nullable().describe(
    'Where the founder is RIGHT NOW as they mark complete — what changed inside them, what tangible outcome arrived (or didn\'t), what the validation signal said. Honest about negative outcomes: market said no, walked away, pivoted out — these are valuable stories. Set to null only if the venture ended without resolution.',
  ),
  closingReflection: z.string().describe(
    '2-3 sentences addressed DIRECTLY TO THE FOUNDER in second person. In their voice as much as you can manage. Acknowledges what they actually did, names the choice ahead, ends with something that respects them. Always populated — never null.',
  ),
  customSections: z.array(TransformationCustomSectionSchema).nullable().describe(
    'Optional extra sections for things that genuinely emerged outside the default sections (e.g. a specific community they unexpectedly connected with, a personal life event that shaped the venture, a moment of clarity worth its own beat). Set to null or empty when the defaults cover the story. Do not invent sections to fill space.',
  ),
  sectionOrder: z.array(z.enum(DEFAULT_SECTION_KEYS)).describe(
    'Ordered list of which DEFAULT sections appear and in what order. Sections not listed here are dropped from the rendered report — drop sections that have nothing real to say. closingReflection is typically last. Custom sections render after the default list, in the order they appear in customSections.',
  ),
});
export type TransformationReport = z.infer<typeof TransformationReportSchema>;

/**
 * Safely parse the JSONB content column. Returns null on malformed
 * data so the viewer can render a "couldn't load" state instead of
 * crashing on a corrupt row.
 */
export function safeParseTransformationReport(value: unknown): TransformationReport | null {
  if (value == null) return null;
  const parsed = TransformationReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Redaction candidates — used by Commit 3's redaction editor. Lives
// here so the Commit-2 schema file holds the whole shape and the
// engine can be extended later without restructuring imports.
// ---------------------------------------------------------------------------

export const REDACTION_TYPES = [
  'name',
  'email',
  'phone',
  'business_name',
  'location',
  'specific_number',
  'other',
] as const;
export type RedactionType = typeof REDACTION_TYPES[number];

export const RedactionCandidateSchema = z.object({
  id:         z.string().describe('Stable id for client-side editing. Format: "rc-N".'),
  text:       z.string().describe('The literal substring detected in the report.'),
  type:       z.enum(REDACTION_TYPES),
  suggestion: z.enum(['redact', 'replace', 'keep']),
  replacement: z.string().nullable().describe('When suggestion is "replace", what to substitute. Null otherwise.'),
  rationale:  z.string().describe('One sentence on why this might be sensitive — helps the founder make the call.'),
});
export type RedactionCandidate = z.infer<typeof RedactionCandidateSchema>;

export const RedactionCandidatesArraySchema = z.array(RedactionCandidateSchema);

// ---------------------------------------------------------------------------
// Founder-edit shapes — moved here from redaction.ts so the client
// barrel can re-export the schemas without dragging redaction.ts's
// `import 'server-only'` into the browser bundle.
// ---------------------------------------------------------------------------

export const RedactionEditEntrySchema = z.object({
  action:      z.enum(['keep', 'redact', 'replace']),
  replacement: z.string().nullable(),
});
export type RedactionEditEntry = z.infer<typeof RedactionEditEntrySchema>;

export const RedactionEditsSchema = z.record(z.string(), RedactionEditEntrySchema);
export type RedactionEdits = z.infer<typeof RedactionEditsSchema>;

// ---------------------------------------------------------------------------
// Public archive — outcome label + card summary shape. The marketing
// strip + /stories index render from these; the full /stories/[slug]
// page renders from the underlying TransformationReport content.
// ---------------------------------------------------------------------------

export const OUTCOME_LABELS = [
  'shipped',
  'walked_away',
  'pivoted',
  'learning',
] as const;
export type OutcomeLabel = typeof OUTCOME_LABELS[number];

/**
 * Card-content snapshot for a public story. Auto-derived on first
 * approval from the report's existing fields; the moderator can
 * edit before publish so the public face of the story stays
 * tight + on-brand. Stored on TransformationReport.cardSummary
 * (separate from `content`) so the strip's read path doesn't
 * have to parse and trim a 600-word section dump.
 *
 * - openingQuote  — italic gold pull-quote on the card. 2-3 lines max.
 *                    Typically pulled from centralChallenge or
 *                    startingPoint at derive-time.
 * - setup         — slate-300 setup paragraph below the opening quote.
 *                    2 lines max. Pulled from whatYouLearned or
 *                    written by the moderator.
 * - closingQuote  — white pull-quote at the bottom of the card.
 *                    Pulled from endingPoint or closingReflection.
 * - moderatorNote — optional 1-line "Why this story matters" call-out.
 *                    Only rendered on featured cards.
 */
export const TransformationCardSummarySchema = z.object({
  openingQuote:  z.string().describe('Italic gold pull-quote at the top of the card. 2-3 lines max in the rendered output, but no schema-level cap — moderator can override.'),
  setup:         z.string().describe('Setup paragraph below the opening quote. 2 lines max in the rendered output.'),
  closingQuote:  z.string().describe('Closing pull-quote at the bottom of the card.'),
  moderatorNote: z.string().nullable().describe('Optional moderator-written note for featured cards. 1 line max. Null for standard cards.'),
});
export type TransformationCardSummary = z.infer<typeof TransformationCardSummarySchema>;

/**
 * Safely parse a TransformationReport.cardSummary JSONB value.
 * Returns null on null input or parse failure so consumers can
 * fall back to the auto-derived view without crashing on a
 * corrupt row.
 */
export function safeParseCardSummary(value: unknown): TransformationCardSummary | null {
  if (value == null) return null;
  const parsed = TransformationCardSummarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
