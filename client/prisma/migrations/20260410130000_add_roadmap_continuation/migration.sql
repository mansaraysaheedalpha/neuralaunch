-- Roadmap Continuation Feature — Phase 1 data foundations.
-- See docs/ROADMAP_CONTINUATION.md for the full spec.
--
-- Adds the columns and self-relation that the continuation engine
-- and the "What's Next?" checkpoint flow read from. Each column has
-- a documented purpose in prisma/schema.prisma:
--
--   parkingLot         — adjacent ideas surfaced during execution
--   diagnosticHistory  — Scenarios A/B chat transcript
--   continuationBrief  — Opus-generated 5-section brief output
--   executionMetrics   — speed-calibration data captured at brief time
--   continuationStatus — lifecycle marker for the checkpoint flow
--   parentRoadmapId    — self-relation for the cycle (next-cycle roadmaps point back)
--
-- All defaults are non-destructive: existing roadmaps get empty
-- arrays / null values, no backfill required.

ALTER TABLE "Roadmap"
  ADD COLUMN IF NOT EXISTS "parkingLot"         JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "diagnosticHistory"  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "continuationBrief"  JSONB,
  ADD COLUMN IF NOT EXISTS "executionMetrics"   JSONB,
  ADD COLUMN IF NOT EXISTS "continuationStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "parentRoadmapId"    TEXT;

-- Self-referential foreign key for the continuation cycle. ON DELETE
-- SET NULL because deleting an old roadmap must not cascade-delete
-- its descendants — each downstream roadmap carries its own
-- execution evidence and that evidence outlives the parent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Roadmap_parentRoadmapId_fkey'
  ) THEN
    ALTER TABLE "Roadmap"
      ADD CONSTRAINT "Roadmap_parentRoadmapId_fkey"
      FOREIGN KEY ("parentRoadmapId") REFERENCES "Roadmap"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- Index for "find children of this roadmap" lookups (cycle walks).
CREATE INDEX IF NOT EXISTS "Roadmap_parentRoadmapId_idx" ON "Roadmap"("parentRoadmapId");
