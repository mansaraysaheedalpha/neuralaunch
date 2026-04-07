// src/lib/outcome/anonymise.ts
import 'server-only';
import type { DiscoveryContext } from '@/lib/discovery/context-schema';

/**
 * Best-effort lexical anonymisation for the outcome training corpus.
 *
 * Honest disclosure surfaced in the consent copy:
 *   "We strip names, emails, phone numbers, and bucket your location
 *    to country level before storing the anonymised version. Free-text
 *    answers may still contain details we cannot automatically detect."
 *
 * This is NOT cryptographic anonymisation. It is the same depth the
 * major labs apply to their training corpora. The TTL on the
 * anonymised payload (24 months) and retroactive deletion on consent
 * withdrawal are the additional protections that make NeuraLaunch's
 * standard meaningfully higher than the industry norm.
 *
 * If we ever build a public-facing dataset, the upgrade path is an
 * LLM-based redaction pass over the free text at write time. Defer
 * until that need exists.
 */

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

// Email tokens. Standard RFC-ish — good enough for the vast majority.
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Phone-shaped digit sequences. Permissive — catches Nigerian, Ghanaian,
// Sierra Leonean, US, EU formats. Anything 8+ digits with optional
// punctuation/spaces.
const PHONE_PATTERN = /\b\+?\d[\d\s\-().]{7,}\d\b/g;

// Capitalised name-shaped tokens (TitleCase Word + optional second word).
// This catches "Aminata Koroma" and "John Smith". It also catches
// proper nouns like "Lagos State" or "Fourah Bay" — that's a known
// false-positive cost we accept since the goal is to remove
// identifying detail, not preserve geographic specificity (which we
// reduce to country anyway via reduceLocationToCountry).
//
// Skips short words (<3 chars) and common starts-of-sentence by
// requiring two consecutive TitleCase tokens — single TitleCase words
// are rarely identifying on their own.
const NAME_PATTERN = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2}\b/g;

const REDACTED = '[redacted]';

/**
 * Pure-string anonymisation. Used by both the belief-state walker and
 * by the outcome free-text field. Idempotent, deterministic, no I/O.
 */
export function redactPiiInText(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(PHONE_PATTERN, REDACTED)
    .replace(NAME_PATTERN,  REDACTED);
}

// ---------------------------------------------------------------------------
// Geographic bucketing
// ---------------------------------------------------------------------------

/**
 * Reduce a free-text geographic market answer to country-level
 * granularity. The belief state's geographicMarket field is captured
 * verbatim from the founder's interview, so values look like:
 *   "Yaba, Lagos, Nigeria"
 *   "Freetown, Sierra Leone"
 *   "Accra, Ghana"
 *   "rural Kenya"
 *   "Bay Area, California, USA"
 *
 * Strategy: take the last comma-separated segment as the country
 * candidate, redact the rest. Falls back to "[location redacted]" when
 * no recognisable country can be extracted.
 */
export function reduceLocationToCountry(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '[location redacted]';
  }
  const segments = value.split(',').map(s => s.trim()).filter(Boolean);
  if (segments.length === 0) return '[location redacted]';
  const last = segments[segments.length - 1];
  // Country names are typically 3-30 chars and don't contain digits
  if (last.length >= 3 && last.length <= 30 && !/\d/.test(last)) {
    // Best-effort: capitalise the first letter to normalise
    return last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
  }
  return '[location redacted]';
}

// ---------------------------------------------------------------------------
// Belief state walker
// ---------------------------------------------------------------------------

/**
 * Build the anonymised payload from a recommendation's full context.
 * Returns a deeply-cleaned object with the same shape as a stripped
 * belief state plus the outcome metadata, ready to write to
 * RecommendationOutcome.anonymisedRecord.
 *
 * NEVER call this function in a code path that might persist its
 * result without a consent check. The route handler enforces the
 * invariant; this function does not — it is a pure transformer.
 */
export interface AnonymiseInput {
  beliefState:    DiscoveryContext;
  recommendation: {
    recommendationType: string | null;
    path:               string;
    summary:            string;
    audienceType:       string | null;
  };
  outcome: {
    outcomeType: string;
    freeText:    string | null;
    weakPhases:  string[];
  };
}

export function buildAnonymisedOutcomeRecord(input: AnonymiseInput): Record<string, unknown> {
  const { beliefState, recommendation, outcome } = input;

  // Walk the belief state field-by-field. We DO NOT spread the
  // belief state object — we explicitly list which fields make it
  // through, with the right anonymisation per field. This prevents
  // a future schema addition from leaking unintentionally.
  const cleanedBelief: Record<string, unknown> = {};

  // Free-text fields → lexical PII strip
  if (beliefState.situation?.value) {
    cleanedBelief.situation = redactPiiInText(String(beliefState.situation.value));
  }
  if (beliefState.primaryGoal?.value) {
    cleanedBelief.primaryGoal = redactPiiInText(String(beliefState.primaryGoal.value));
  }
  if (beliefState.biggestConcern?.value) {
    cleanedBelief.biggestConcern = redactPiiInText(String(beliefState.biggestConcern.value));
  }

  // Array of free-text → strip each entry
  if (beliefState.whatTriedBefore?.value) {
    const raw = beliefState.whatTriedBefore.value;
    const arr = Array.isArray(raw) ? raw : [];
    cleanedBelief.whatTriedBefore = arr
      .filter((v): v is string => typeof v === 'string')
      .map(redactPiiInText);
  }

  // Geographic market → country-level bucket
  if (beliefState.geographicMarket?.value) {
    cleanedBelief.geographicMarket = reduceLocationToCountry(beliefState.geographicMarket.value);
  }

  // Numeric/categorical fields — pass through unchanged
  if (beliefState.availableBudget?.value) {
    cleanedBelief.availableBudget = String(beliefState.availableBudget.value);
  }
  if (beliefState.technicalAbility?.value) {
    cleanedBelief.technicalAbility = String(beliefState.technicalAbility.value);
  }

  return {
    schemaVersion: 1,
    audienceType:  recommendation.audienceType,
    recommendationType: recommendation.recommendationType,
    // Recommendation path/summary are already structurally Opus
    // output but may contain founder-influenced text post-refinement;
    // run them through the same lexical strip.
    recommendationPath:    redactPiiInText(recommendation.path),
    recommendationSummary: redactPiiInText(recommendation.summary),
    beliefState:           cleanedBelief,
    outcome: {
      outcomeType: outcome.outcomeType,
      freeText:    outcome.freeText ? redactPiiInText(outcome.freeText) : null,
      weakPhases:  outcome.weakPhases.map(redactPiiInText),
    },
  };
}
