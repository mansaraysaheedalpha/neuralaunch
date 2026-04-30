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

/**
 * IMPORTANT: every field on this schema is REQUIRED — no `.nullable()`,
 * no `.optional()` — because Anthropic's structured-output validator
 * was returning `{}` (empty tool-call args) when the schema mixed
 * 8+ nullable strings with verbose descriptions. The renderer
 * achieves the dynamic-section experience at RENDER TIME by
 * checking `sectionOrder` and dropping sections whose body is
 * empty/whitespace. Tone instruction: "if a section has nothing
 * real to say, write a single short sentence acknowledging that
 * and OMIT the key from sectionOrder so the renderer drops it."
 *
 * Field descriptions are kept short. Long descriptions inflate the
 * tool spec and reduce model reliability.
 */
export const TransformationReportSchema = z.object({
  startingPoint:     z.string().describe('Where the founder was when they started this venture. Quote their own opening words when possible. 2-4 sentences.'),
  centralChallenge:  z.string().describe('The real thing they were stuck on. The actual problem, not the surface symptom. 2-3 sentences.'),
  decisivePivots:    z.array(TransformationDecisivePivotSchema).describe('Turning points across the venture (2-4). Empty array if the journey was linear.'),
  whatYouLearned:    z.string().describe('Insights that compound beyond this venture. Durable lessons, not bullets. 2-4 sentences.'),
  whatYouBuilt:      z.string().describe('Concrete outputs produced. 1-3 sentences. If nothing shipped, say so honestly.'),
  honestStruggles:   z.string().describe('What was hard. What they avoided. What almost stopped them. 2-3 sentences.'),
  endingPoint:       z.string().describe('Where the founder is right now. Honest about negative outcomes. 2-4 sentences.'),
  closingReflection: z.string().describe('2-3 sentences addressed to the founder in second person. Acknowledges what they did, ends respectfully.'),
  customSections:    z.array(TransformationCustomSectionSchema).describe('Optional extra sections for asymmetric findings. Empty array if the defaults cover the story.'),
  sectionOrder:      z.array(z.enum(DEFAULT_SECTION_KEYS)).describe('Ordered list of which sections render, in narrative order. Drop section keys whose body has nothing real to say. closingReflection is typically last.'),
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
