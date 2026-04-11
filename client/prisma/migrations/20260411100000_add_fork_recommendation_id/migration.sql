-- Add forkRecommendationId column to Roadmap.
-- Powers the continuation/fork route's idempotency: a retry of the
-- same fork pick (e.g. after a transient inngest.send failure)
-- reads this column to find the existing fork-derived Recommendation
-- rather than creating a duplicate. The @unique constraint also
-- guards against concurrent double-creates at the database level.

ALTER TABLE "Roadmap"
  ADD COLUMN IF NOT EXISTS "forkRecommendationId" TEXT;

-- Idempotent unique constraint installation. CREATE UNIQUE INDEX
-- IF NOT EXISTS is supported on Postgres 9.5+ (we are on 16+).
CREATE UNIQUE INDEX IF NOT EXISTS "Roadmap_forkRecommendationId_key"
  ON "Roadmap"("forkRecommendationId");
