-- Migration: flip_recommendation_alternative_direction
--
-- Background: Recommendation.sessionId was @unique, which prevented the
-- pushback-alternative function from writing a NEW Recommendation row
-- against the same DiscoverySession as its parent. Every alt-creation
-- attempt threw P2002, the function failed, retries failed identically,
-- and the alternative feature has been silently dead in production.
--
-- This migration reshapes the self-relation to fix the invariant:
--
--   Before:
--     - Recommendation.sessionId @unique
--     - Recommendation.alternativeRecommendationId @unique (parent → alt)
--
--   After:
--     - Recommendation.sessionId is NOT unique at the column level.
--     - A partial unique enforces "at most one primary per session":
--         UNIQUE (sessionId) WHERE parentRecommendationId IS NULL
--     - Recommendation.parentRecommendationId @unique (alt → parent)
--     - Old alternativeRecommendationId column is dropped.
--
-- Backfill: any existing prod row that had alternativeRecommendationId
-- set on the parent gets that link rewritten as parentRecommendationId
-- on the alt before the old column is dropped. Per investigation the
-- alt feature has been broken so the count is expected to be zero, but
-- the backfill is idempotent and safe to run regardless.

-- =========================================================================
-- 1. Add the new column (NULL on every row by default)
-- =========================================================================
ALTER TABLE "Recommendation"
  ADD COLUMN IF NOT EXISTS "parentRecommendationId" TEXT;

-- =========================================================================
-- 2. Backfill: copy parent.alternativeRecommendationId → alt.parentRecommendationId
-- =========================================================================
-- For every row P that has alternativeRecommendationId = A, write A's
-- parentRecommendationId = P.id. Skip rows whose target alt no longer
-- exists (referential cleanup — the old column had no FK constraint
-- forcing referential integrity, so dangling values are theoretically
-- possible).
UPDATE "Recommendation" alt
SET    "parentRecommendationId" = parent."id"
FROM   "Recommendation" parent
WHERE  parent."alternativeRecommendationId" = alt."id"
  AND  parent."alternativeRecommendationId" IS NOT NULL;

-- =========================================================================
-- 3. Drop the old column and its unique index
-- =========================================================================
-- Prisma named the unique index on the old column "Recommendation_alternativeRecommendationId_key".
DROP INDEX IF EXISTS "Recommendation_alternativeRecommendationId_key";

ALTER TABLE "Recommendation"
  DROP CONSTRAINT IF EXISTS "Recommendation_alternativeRecommendationId_fkey";

ALTER TABLE "Recommendation"
  DROP COLUMN IF EXISTS "alternativeRecommendationId";

-- =========================================================================
-- 4. Drop the column-level unique on sessionId
-- =========================================================================
-- Prisma named the unique constraint on sessionId "Recommendation_sessionId_key".
DROP INDEX IF EXISTS "Recommendation_sessionId_key";
ALTER TABLE "Recommendation"
  DROP CONSTRAINT IF EXISTS "Recommendation_sessionId_key";

-- =========================================================================
-- 5. Add the new full unique on parentRecommendationId
-- =========================================================================
-- Schema declares @unique on this column. Prisma's auto-generated index
-- name format is <Table>_<column>_key.
CREATE UNIQUE INDEX IF NOT EXISTS "Recommendation_parentRecommendationId_key"
  ON "Recommendation" ("parentRecommendationId");

-- =========================================================================
-- 6. Add the FK on parentRecommendationId → Recommendation.id
-- =========================================================================
ALTER TABLE "Recommendation"
  ADD CONSTRAINT "Recommendation_parentRecommendationId_fkey"
  FOREIGN KEY ("parentRecommendationId")
  REFERENCES "Recommendation"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- =========================================================================
-- 7. Add the partial unique that captures the real "one primary per
--    session" invariant. Postgres semantics: NULLs are not equal to
--    each other, so multiple rows with parentRecommendationId IS NULL
--    would normally be allowed under a regular UNIQUE — the WHERE
--    clause restricts the index to primary rows only, preserving the
--    same row-count constraint the old @unique on sessionId enforced
--    for primaries while letting alternatives coexist.
-- =========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "Recommendation_sessionId_primary_key"
  ON "Recommendation" ("sessionId")
  WHERE "parentRecommendationId" IS NULL;

-- =========================================================================
-- Pre-flight detection (run in shadow before applying):
-- =========================================================================
--
-- 1. Confirm at most one primary per session today (must be 0):
--    SELECT "sessionId", COUNT(*)
--    FROM "Recommendation"
--    WHERE "alternativeRecommendationId" IS NULL
--    GROUP BY "sessionId"
--    HAVING COUNT(*) > 1;
--
-- 2. Detect dangling alternativeRecommendationId values (must be 0):
--    SELECT p."id", p."alternativeRecommendationId"
--    FROM   "Recommendation" p
--    WHERE  p."alternativeRecommendationId" IS NOT NULL
--      AND  NOT EXISTS (
--             SELECT 1 FROM "Recommendation" a WHERE a."id" = p."alternativeRecommendationId"
--           );
