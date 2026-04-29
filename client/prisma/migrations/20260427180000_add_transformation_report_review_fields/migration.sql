-- TransformationReport — moderation + public archive support
--
-- Four nullable columns added to support the moderator queue and
-- the marketing-strip / /stories index. All additive; legacy rows
-- (private + pending_review reports that pre-date this migration)
-- continue to render unchanged.
--
--   reviewNotes      — moderator's notes, surfaced to founder on
--                      send-back, kept internal on decline
--   reviewedAt       — wall-clock of last moderator action; lets
--                      the founder banner detect fresh feedback
--   outcomeLabel     — moderator-stamped chip color: shipped /
--                      walked_away / pivoted / learning
--   cardSummary      — moderator-controlled public card content
--                      (openingQuote, setup, closingQuote,
--                      moderatorNote). Auto-derived on first
--                      approval; editable before publish.
--
-- Index on (publishState, publishedAt) makes the public archive's
-- "newest-first chronological" query trivially fast even when the
-- archive has thousands of rows; only the small subset where
-- publishState='public' is scanned.

ALTER TABLE "TransformationReport"
  ADD COLUMN "reviewNotes"   TEXT,
  ADD COLUMN "reviewedAt"    TIMESTAMP(3),
  ADD COLUMN "outcomeLabel"  TEXT,
  ADD COLUMN "cardSummary"   JSONB;

CREATE INDEX "TransformationReport_publishState_publishedAt_idx"
  ON "TransformationReport"("publishState", "publishedAt");
