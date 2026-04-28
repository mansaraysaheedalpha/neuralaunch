// src/lib/transformation/card-summary.ts
//
// Auto-derive a publish-ready card snapshot from a finished
// TransformationReport. The moderator queue calls this on first
// approval to seed the cardSummary column; the moderator can then
// edit each field before flipping publishState='public'.
//
// Pure function. No I/O. The picks below are heuristic — find a
// short, quotable sentence in the highest-signal field, fall back
// to lower-signal fields if none qualify. Truncate liberally —
// long sentences would break the strip's visual rhythm and most
// readers tap "Read full story →" anyway.

import type { TransformationCardSummary } from './schemas';
import type { TransformationReport } from './schemas';

const OPENING_TARGET_CHARS = 180;
const SETUP_TARGET_CHARS   = 240;
const CLOSING_TARGET_CHARS = 200;

/**
 * Derive an opening pull-quote, a setup paragraph, and a closing
 * pull-quote from a TransformationReport. The moderator overrides
 * each field individually in the admin queue before the story
 * goes public, so this only needs to be reasonable, not perfect.
 */
export function deriveCardSummary(report: TransformationReport): TransformationCardSummary {
  return {
    openingQuote:  pickOpeningQuote(report),
    setup:         pickSetup(report),
    closingQuote:  pickClosingQuote(report),
    moderatorNote: null,
  };
}

// ---------------------------------------------------------------------------
// Opening quote — strong, hook-y. Centred on what the founder was
// stuck on at the start. centralChallenge first because it's the
// "real thing they were stuck on" — most quotable. startingPoint
// second because it captures the situation. Synthesised fallback
// last so we never produce an empty card.
// ---------------------------------------------------------------------------

function pickOpeningQuote(report: TransformationReport): string {
  const challenge = trimToFirstSentence(report.centralChallenge, OPENING_TARGET_CHARS);
  if (challenge) return challenge;

  const start = trimToFirstSentence(report.startingPoint, OPENING_TARGET_CHARS);
  if (start) return start;

  // Always-populated fallback: the closingReflection's first
  // sentence. closingReflection is schema-guaranteed non-null so
  // this branch never produces an empty string.
  return trimToFirstSentence(report.closingReflection, OPENING_TARGET_CHARS) ?? report.closingReflection.slice(0, OPENING_TARGET_CHARS);
}

// ---------------------------------------------------------------------------
// Setup — the connective tissue between the opening quote and the
// closing pull-quote. Pulled from whatYouLearned because that
// field already frames "what carries forward beyond this venture."
// honestStruggles is the dignified fallback. centralChallenge
// gets used here only when nothing else exists, since it may
// already be quoted above.
// ---------------------------------------------------------------------------

function pickSetup(report: TransformationReport): string {
  const learned = trimToFirstSentences(report.whatYouLearned, 2, SETUP_TARGET_CHARS);
  if (learned) return learned;

  const struggles = trimToFirstSentences(report.honestStruggles, 2, SETUP_TARGET_CHARS);
  if (struggles) return struggles;

  const built = trimToFirstSentences(report.whatYouBuilt, 2, SETUP_TARGET_CHARS);
  if (built) return built;

  // closingReflection is schema-guaranteed populated — last-resort
  // fallback that always produces text.
  return trimToFirstSentences(report.closingReflection, 2, SETUP_TARGET_CHARS)
    ?? report.closingReflection.slice(0, SETUP_TARGET_CHARS);
}

// ---------------------------------------------------------------------------
// Closing quote — where they ended up. endingPoint first (the
// schema field literally captures "where the founder is right
// now"). closingReflection second because it's always populated
// and addresses the founder in second person.
// ---------------------------------------------------------------------------

function pickClosingQuote(report: TransformationReport): string {
  const ending = trimToFirstSentence(report.endingPoint, CLOSING_TARGET_CHARS);
  if (ending) return ending;

  return trimToFirstSentence(report.closingReflection, CLOSING_TARGET_CHARS)
    ?? report.closingReflection.slice(0, CLOSING_TARGET_CHARS);
}

// ---------------------------------------------------------------------------
// Sentence-level trim helpers. Both return null when the input is
// null/empty so callers can chain fallbacks via ??.
// ---------------------------------------------------------------------------

function trimToFirstSentence(text: string | null, maxChars: number): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  // Match through the first sentence-ending punctuation. Keep the
  // punctuation; it reads better as a quote with the period intact.
  const match = /^[^.!?]+[.!?]/.exec(trimmed);
  const sentence = match ? match[0] : trimmed;

  if (sentence.length <= maxChars) return sentence;
  return sentence.slice(0, maxChars - 1).trimEnd() + '…';
}

function trimToFirstSentences(text: string | null, count: number, maxChars: number): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const sentences = trimmed.match(/[^.!?]+[.!?]+\s*/g) ?? [trimmed];
  const picked = sentences.slice(0, count).join('').trim();
  if (picked.length === 0) return null;

  if (picked.length <= maxChars) return picked;
  return picked.slice(0, maxChars - 1).trimEnd() + '…';
}
