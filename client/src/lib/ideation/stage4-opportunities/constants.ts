// src/lib/ideation/stage4-opportunities/constants.ts
//
// Server-only constants for Stage 4. Cross-app enum value lists live
// in @neuralaunch/constants/ideation; this file holds the thresholds,
// limits, and caps that are server-side concerns.

// ---- Composition gate -----------------------------------------------------

/** Floor of evaluated, non-dropped opportunities before commit. */
export const MIN_EVALUATED_OPPORTUNITIES_FOR_COMMIT = 1;

/** Hard ceiling — Stage 4 inherits the top N from Stage 3's shortlist. */
export const MAX_OPPORTUNITIES_PER_STAGE = 5;

// ---- Layer A — per-opportunity research ----------------------------------

/** Per-opportunity research-step budget (Tavily + Exa + community_pulse). */
export const STAGE4_LAYER_A_RESEARCH_STEPS = 6;

/** Per-dimension reasoning + citations call budget. */
export const LAYER_A_DIMENSION_MAX_TOKENS = 1200;

/** The four dimensions, in display order. */
export const LAYER_A_DIMENSIONS = [
  'marketReality',
  'customerAccess',
  'willPeoplePay',
  'marketSize',
] as const;
export type LayerADimensionKey = typeof LAYER_A_DIMENSIONS[number];

// ---- Layer B — founder community engagement ------------------------------

/** Test-script generator output budget. */
export const LAYER_B_SCRIPT_MAX_TOKENS = 800;

/** FIFO cap per opportunity for CommunityResponse rows. */
export const MAX_RESPONSES_PER_OPPORTUNITY = 12;

/** Presigned-upload byte cap. 8 MB covers high-res mobile screenshots. */
export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

/** Allowed Content-Type values validated at the presign route. */
export const ALLOWED_SCREENSHOT_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
export type AllowedScreenshotContentType = typeof ALLOWED_SCREENSHOT_CONTENT_TYPES[number];

/** Per-comment excerpt cap when feeding extracted text into downstream LLM calls. */
export const COMMUNITY_COMMENT_EXCERPT_MAX_CHARS = 600;

// ---- Verdict pushback engine ---------------------------------------------

/** Hard round cap per opportunity; engine coerces to 'closing' on cap. */
export const MAX_VERDICT_PUSHBACK_ROUNDS = 5;

/** Soft-warn round — agent considers closing if not converging. */
export const VERDICT_PUSHBACK_SOFT_WARN_ROUND = 3;

/** Per-round output ceiling (reasoning + emit together). */
export const VERDICT_PUSHBACK_ROUND_MAX_TOKENS = 1200;

// ---- Vision extractor ----------------------------------------------------

/** Sonnet extraction call ceiling — structured output rarely uses it all. */
export const VISION_EXTRACTION_MAX_TOKENS = 2000;

/** Haiku moderation gate — tiny structured output. */
export const VISION_MODERATION_MAX_TOKENS = 200;

// ---- Composition output --------------------------------------------------

/** Composer LLM call producing chosenRationale + rejectedRationale prose. */
export const OPPORTUNITY_DOCUMENT_COMPOSITION_MAX_TOKENS = 1000;

/** FIFO cap for recommended-action log — same shape as Stage 1/2/3. */
export const MAX_RECOMMENDED_ACTIONS_STAGE4 = 25;

// ---- Models --------------------------------------------------------------
//
// Same MODELS table Stages 1/2/3 use. Sonnet for Layer A tool loop +
// verdict synthesis + composer; Opus for verdict-pushback reasoning
// (same Opus-reasoning → Sonnet-emit pattern as Stage 3 score-pushback).
// Vision extraction uses Sonnet directly (accepts image content parts
// natively); Haiku is INTERVIEW_FALLBACK_1 for the moderation gate.

export { MODELS } from '@/lib/discovery/constants';
