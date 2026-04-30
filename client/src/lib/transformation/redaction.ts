// src/lib/transformation/redaction.ts
//
// Two-stage redaction surface for the Transformation Report:
//
//   Stage A — auto-redact baseline (this file)
//     Pure regex pass that walks every string field of a report and
//     replaces high-confidence PII with a [redacted] marker. Always
//     applied before the founder ever sees the redaction editor.
//     Founders can choose to redact MORE; they cannot choose to
//     un-redact baseline matches.
//
//   Stage B — detector candidates (engine.ts adds detectRedactionCandidates)
//     Opus call that reads the post-baseline report and proposes
//     additional context-sensitive redactions: business names,
//     locations, specific monetary amounts under the threshold,
//     anything that an auto-regex can't catch. The founder
//     reviews these in the editor (Commit 3 UI) and chooses
//     keep/redact/replace.
//
//   applyRedactionEdits() at the bottom takes the finished
//   founder-approved edit set and produces the publish-ready
//   redacted report (used by Commit 3's publish action).

import 'server-only';
import {
  TransformationReportSchema,
  RedactionCandidatesArraySchema,
  type TransformationReport,
  type RedactionCandidate,
  type RedactionEditEntry,
  type RedactionEdits,
} from './schemas';

// Re-export the founder-edit types alongside the runtime helpers
// for callers that already import from this file. The schemas live
// in schemas.ts so the client barrel can surface them without
// pulling 'server-only' into the browser bundle.
export type { RedactionEditEntry, RedactionEdits };

// ---------------------------------------------------------------------------
// Auto-redact baseline — high-confidence regex matches that always fire,
// regardless of founder consent. Conservative on purpose.
// ---------------------------------------------------------------------------

const REDACTED_MARKER = '[redacted]';
const LOCATION_MARKER = '[location redacted]';

/**
 * High-confidence patterns. Each is its own pass so we can tune
 * individually if a particular pattern over-redacts in production.
 *
 * Order matters: emails before names, since emails contain dot-
 * separated TitleCase fragments that the name regex would otherwise
 * try to chop up.
 */
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Phone numbers — international + domestic formats. Errs slightly on
 * the side of redacting any digit run that LOOKS like a phone (8+
 * digits with optional separators); occasional false positives
 * (large dollar amounts) are caught by the currency redactor below
 * anyway.
 */
const PHONE_REGEX = /\b\+?\d[\d\s\-().]{7,}\d\b/g;

/**
 * TitleCase name sequences — at least two consecutive Capitalised
 * tokens (e.g. "Saheed Mansaray", "Lagos Business Initiative"). Will
 * occasionally over-redact organisation names; the founder can
 * choose to KEEP a baseline-redacted match in the editor by
 * replacing it with a non-PII alias.
 *
 * Allows accented capitals (À-Ý) and apostrophes for names like
 * "O'Brien" or "D'Costa".
 */
const NAME_REGEX = /\b(?:[A-ZÀ-Ý][a-zà-ÿ']+(?:\s+|-))+[A-ZÀ-Ý][a-zà-ÿ']+\b/g;

/**
 * Currency amounts above the threshold. ($1000 / £1000 / €1000 /
 * ₦1m / etc.) Below-threshold amounts are left for the detector to
 * consider — a $50 lunch reference is not PII, a $40,000 fundraise
 * is.
 */
const LARGE_CURRENCY_REGEX = /(?:[$£€¥]|USD|GBP|EUR|NGN|GHS|ZAR|KES|N|₦|₵|R)\s*\d[\d,]*(?:\.\d{2})?(?:\s*(?:k|K|m|M|million|thousand))?/g;

/** Configurable threshold above which a currency amount is auto-redacted. */
const CURRENCY_THRESHOLD = 1000;

/**
 * Apply the auto-redact baseline to a single string. Pure. Order
 * matters — emails first so the email's local part (which can be
 * TitleCase) doesn't trigger the name regex.
 */
export function autoRedactString(s: string, founderFirstName: string | null): string {
  let out = s;

  // Email + phone first.
  out = out.replace(EMAIL_REGEX, REDACTED_MARKER);
  out = out.replace(PHONE_REGEX, REDACTED_MARKER);

  // Founder's own first name — explicit, case-insensitive whole word.
  // Always-redacted because the report is meant to read in second
  // person ("you ...") rather than name them.
  if (founderFirstName && founderFirstName.length >= 2) {
    const escaped = founderFirstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), REDACTED_MARKER);
  }

  // Currency above threshold.
  out = out.replace(LARGE_CURRENCY_REGEX, (match) => {
    const amount = parseCurrencyMagnitude(match);
    return amount >= CURRENCY_THRESHOLD ? REDACTED_MARKER : match;
  });

  // Names last. Skip already-redacted markers (the [redacted] string
  // contains 'TitleCase' that the regex would re-redact otherwise).
  out = out.replace(NAME_REGEX, (match) => {
    if (match.includes(REDACTED_MARKER) || match.includes(LOCATION_MARKER)) return match;
    return REDACTED_MARKER;
  });

  return out;
}

function parseCurrencyMagnitude(match: string): number {
  // Strip currency symbol + words, parse the number, multiply by
  // suffix multiplier if present.
  const cleaned = match
    .replace(/[$£€¥]|USD|GBP|EUR|NGN|GHS|ZAR|KES|N|₦|₵|R|,|\s/g, '')
    .replace(/[a-zA-Z]+$/, ''); // strip trailing k/m/million/thousand
  const base = parseFloat(cleaned);
  if (!Number.isFinite(base)) return 0;
  if (/m|million/i.test(match))   return base * 1_000_000;
  if (/k|thousand/i.test(match))  return base * 1_000;
  return base;
}

/**
 * Walk every string field of the structured report and apply the
 * auto-redact baseline. Pure — does not mutate input. Returns a
 * report with the same shape, where every string has been
 * baseline-redacted.
 *
 * The schema is re-validated at the boundary so a malformed input
 * surfaces as a parse error instead of silently producing a
 * malformed redacted output.
 */
export function autoRedactReport(
  report: TransformationReport,
  founderFirstName: string | null,
): TransformationReport {
  const r = (s: string) => autoRedactString(s, founderFirstName);

  // Schema is now all-required (every field present, never null).
  // The renderer's source of truth for which sections appear is
  // sectionOrder; an empty/short body in any section is dropped at
  // render time by the engine's normaliseSectionOrder. Redaction
  // therefore always runs against a present string.
  const redacted: TransformationReport = {
    startingPoint:     r(report.startingPoint),
    centralChallenge:  r(report.centralChallenge),
    decisivePivots:    report.decisivePivots.map(p => ({
      moment: r(p.moment),
      why:    r(p.why),
      change: r(p.change),
    })),
    whatYouLearned:    r(report.whatYouLearned),
    whatYouBuilt:      r(report.whatYouBuilt),
    honestStruggles:   r(report.honestStruggles),
    endingPoint:       r(report.endingPoint),
    closingReflection: r(report.closingReflection),
    customSections:    report.customSections.map(cs => ({
      heading: r(cs.heading),
      body:    r(cs.body),
    })),
    sectionOrder:      report.sectionOrder,
  };

  return TransformationReportSchema.parse(redacted);
}

// ---------------------------------------------------------------------------
// Apply founder-approved redaction edits to a baseline-redacted
// report. Each candidate carries an action: keep / redact / replace.
//   keep    → no further substitution (the baseline output stands)
//   redact  → substitute the candidate text with [redacted]
//   replace → substitute with the founder's chosen replacement
//
// Used by Commit 3's publish flow — the founder hits Confirm in
// the redaction editor, the server runs autoRedactReport (baseline)
// then this function (founder edits) and persists the result as
// the public-version content. The private content stays unredacted.
// ---------------------------------------------------------------------------


/**
 * Apply founder edits to a report. Each candidate's text is found
 * (whole-word, case-sensitive, single-pass left-to-right) and
 * substituted per the edit action. Unspecified candidates default to
 * the candidate's `suggestion` field — typically 'redact' for
 * detector-found PII.
 */
export function applyRedactionEdits(
  report: TransformationReport,
  candidates: RedactionCandidate[],
  edits: RedactionEdits,
): TransformationReport {
  if (candidates.length === 0) return report;

  // Build the substitution map: for each candidate, decide what to
  // replace its text with. Default to suggestion if no edit.
  const subs = new Map<string, string>();
  for (const c of candidates) {
    const edit = edits[c.id];
    const action = edit?.action ?? c.suggestion;

    if (action === 'keep') {
      // Skip — nothing to replace.
      continue;
    }
    if (action === 'replace') {
      const replacement = edit?.replacement ?? c.replacement ?? REDACTED_MARKER;
      subs.set(c.text, replacement);
    } else {
      subs.set(c.text, REDACTED_MARKER);
    }
  }

  if (subs.size === 0) return report;

  const apply = (s: string): string => {
    let out = s;
    for (const [needle, replacement] of subs) {
      // Whole-word, escape special chars in the needle.
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(escaped, 'g'), replacement);
    }
    return out;
  };

  const out: TransformationReport = {
    startingPoint:     apply(report.startingPoint),
    centralChallenge:  apply(report.centralChallenge),
    decisivePivots:    report.decisivePivots.map(p => ({
      moment: apply(p.moment),
      why:    apply(p.why),
      change: apply(p.change),
    })),
    whatYouLearned:    apply(report.whatYouLearned),
    whatYouBuilt:      apply(report.whatYouBuilt),
    honestStruggles:   apply(report.honestStruggles),
    endingPoint:       apply(report.endingPoint),
    closingReflection: apply(report.closingReflection),
    customSections:    report.customSections.map(cs => ({
      heading: apply(cs.heading),
      body:    apply(cs.body),
    })),
    sectionOrder:      report.sectionOrder,
  };
  return TransformationReportSchema.parse(out);
}

// ---------------------------------------------------------------------------
// Re-export for callers that need the candidate validator (engine
// detector returns this shape; the worker validates before write).
// ---------------------------------------------------------------------------

export { RedactionCandidatesArraySchema };
