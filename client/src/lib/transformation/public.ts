// src/lib/transformation/public.ts
//
// Server-only read helpers for the public transformation archive.
// Used by the marketing strip, the /stories index, and the
// /stories/[slug] viewer. Three properties matter:
//
//   1. Reads are AUTHORIZATION-FREE (no userId scope) — the
//      `publishState='public'` filter IS the authorization. A
//      reader doesn't need an account; a row that's not 'public'
//      is never returned, ever.
//
//   2. Public render content goes through applyRedactionEdits
//      server-side. The DB always holds the unredacted content +
//      the founder's edit set; the publish-version is materialised
//      at read time. This means re-publishing after a redaction
//      change Just Works without a re-render of stored rows.
//
//   3. The strip's read path uses the (publishState, publishedAt)
//      composite index added in the schema migration — list with
//      cursor pagination, ordered newest-first, no full-table scan.

import 'server-only';
import { createId } from '@paralleldrive/cuid2';
import prisma from '@/lib/prisma';
import {
  safeParseTransformationReport,
  safeParseCardSummary,
  RedactionCandidatesArraySchema,
  RedactionEditsSchema,
  OUTCOME_LABELS,
  type TransformationReport,
  type TransformationCardSummary,
  type OutcomeLabel,
} from './schemas';
import { applyRedactionEdits } from './redaction';

/**
 * One entry in the public archive list. Shape minimised to what
 * the strip + index actually need; full content is loaded only by
 * the [slug] viewer's separate query so we don't ship 600-word
 * narratives down for cards that show 60 words of preview.
 */
export interface PublicStorySummary {
  publicSlug:    string;
  ventureName:   string;
  publishedAt:   string;     // ISO
  outcomeLabel:  OutcomeLabel;
  cardSummary:   TransformationCardSummary | null;
}

/**
 * The full /stories/[slug] payload — same render path as the
 * private viewer's NarrativeRender, but with redactions applied
 * and authentication NOT required.
 */
export interface PublicStoryPayload {
  publicSlug:    string;
  ventureName:   string;
  publishedAt:   string;     // ISO
  outcomeLabel:  OutcomeLabel;
  /** TransformationReport with the founder's redaction edits applied. */
  content:       TransformationReport;
}

const STRIP_DEFAULT_TAKE = 12;
const STRIP_MAX_TAKE     = 50;

/**
 * Load the most-recently-published stories for the marketing strip
 * and the /stories index. Cursor pagination: the next page's
 * cursor is the last row's publishedAt + publicSlug pair, but the
 * v1 surfaces don't paginate beyond the first page so the cursor
 * is currently for forward-compat only.
 */
export async function loadPublicStorySummaries(input: {
  take?: number;
} = {}): Promise<PublicStorySummary[]> {
  const take = Math.min(input.take ?? STRIP_DEFAULT_TAKE, STRIP_MAX_TAKE);

  const rows = await prisma.transformationReport.findMany({
    where: {
      publishState: 'public',
      publishedAt:  { not: null },
      publicSlug:   { not: null },
    },
    orderBy: [
      { publishedAt: 'desc' },
    ],
    take,
    select: {
      publicSlug:   true,
      publishedAt:  true,
      outcomeLabel: true,
      cardSummary:  true,
      venture:      { select: { name: true } },
    },
  });

  return rows
    .filter(r => r.publicSlug !== null && r.publishedAt !== null)
    .map(r => ({
      publicSlug:    r.publicSlug as string,
      ventureName:   r.venture.name,
      publishedAt:   (r.publishedAt as Date).toISOString(),
      outcomeLabel:  resolveOutcomeLabel(r.outcomeLabel),
      cardSummary:   safeParseCardSummary(r.cardSummary),
    }));
}

/**
 * Load one story by its public slug, returning the redacted
 * narrative ready for /stories/[slug] to render via the existing
 * NarrativeRender component. Returns null on any of:
 *   - slug doesn't match a row
 *   - row is not in publishState='public'
 *   - row's content failed to parse
 *
 * The redaction-apply happens here, in this function, server-
 * side, so the [slug] page can hand the result directly to a
 * client renderer without leaking the unredacted content.
 */
export async function loadPublicStoryBySlug(slug: string): Promise<PublicStoryPayload | null> {
  if (slug.length === 0 || slug.length > 200) return null;

  const row = await prisma.transformationReport.findFirst({
    where: {
      publicSlug:   slug,
      publishState: 'public',
    },
    select: {
      publicSlug:          true,
      publishedAt:         true,
      outcomeLabel:        true,
      content:             true,
      redactionCandidates: true,
      redactionEdits:      true,
      venture:             { select: { name: true } },
    },
  });

  if (!row || !row.publicSlug || !row.publishedAt) return null;

  const parsedContent = safeParseTransformationReport(row.content);
  if (!parsedContent) return null;

  // Apply the founder's redaction edits to produce the public
  // version of the narrative. The candidates + edits live in
  // their own JSON columns; if either is malformed we fall
  // through to rendering the unedited (but baseline-redacted-by-
  // the-engine) content, which never contains the high-risk PII
  // classes (emails, phones, names, currency >$1k).
  const candidates = row.redactionCandidates
    ? RedactionCandidatesArraySchema.safeParse(row.redactionCandidates)
    : null;
  const edits = row.redactionEdits
    ? RedactionEditsSchema.safeParse(row.redactionEdits)
    : null;

  const redactedContent = candidates?.success && edits?.success
    ? applyRedactionEdits(parsedContent, candidates.data, edits.data)
    : parsedContent;

  return {
    publicSlug:    row.publicSlug,
    ventureName:   row.venture.name,
    publishedAt:   row.publishedAt.toISOString(),
    outcomeLabel:  resolveOutcomeLabel(row.outcomeLabel),
    content:       redactedContent,
  };
}

// ---------------------------------------------------------------------------
// Slug minting — admin moderation queue calls this at approve-time.
// ---------------------------------------------------------------------------

const SLUG_PREFIX_WORDS    = 3;
const SLUG_HASH_LENGTH     = 8;

/**
 * Mint a stable, anonymous public slug for a venture. Format:
 *   {three-word-kebab-prefix-of-venture-name}-{8-char-cuid-suffix}
 *
 * Properties:
 * - Never contains the founder's name (redaction baseline strips
 *   that from the venture name itself).
 * - Stable across re-publishes (caller should reuse the existing
 *   publicSlug if the row already has one, never re-mint).
 * - Suffix-randomised so two ventures with identical-prefix
 *   names don't collide on the @unique constraint.
 *
 * Caller stores the result on TransformationReport.publicSlug
 * inside the same transaction that flips publishState='public'.
 */
export function mintPublicSlug(ventureName: string): string {
  const prefix = ventureName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0)
    .slice(0, SLUG_PREFIX_WORDS)
    .join('-')
    .slice(0, 60);

  const suffix = createId().slice(0, SLUG_HASH_LENGTH);

  return prefix.length > 0 ? `${prefix}-${suffix}` : `story-${suffix}`;
}

// ---------------------------------------------------------------------------
// Outcome label resolution — null defaults to 'learning' (the
// catch-all). Validates against the const tuple so a corrupt row
// doesn't leak through to the renderer's switch statement.
// ---------------------------------------------------------------------------

function resolveOutcomeLabel(value: string | null): OutcomeLabel {
  if (value && (OUTCOME_LABELS as readonly string[]).includes(value)) {
    return value as OutcomeLabel;
  }
  return 'learning';
}
