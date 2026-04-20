-- Drop the existing FK + single-column unique on recommendationId so we can
-- relax the field to nullable and SetNull-on-delete. The unique is dropped
-- defensively: older Prisma eras created @unique as a unique index, newer
-- eras as a table-level constraint. Prod had it as an index; shadow DB
-- had it as a constraint — hence a plain DROP CONSTRAINT failed in prod.
-- Handle either shape.
ALTER TABLE "ValidationPage" DROP CONSTRAINT IF EXISTS "ValidationPage_recommendationId_fkey";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ValidationPage_recommendationId_key') THEN
    EXECUTE 'ALTER TABLE "ValidationPage" DROP CONSTRAINT "ValidationPage_recommendationId_key"';
  ELSIF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ValidationPage_recommendationId_key') THEN
    EXECUTE 'DROP INDEX "ValidationPage_recommendationId_key"';
  END IF;
END $$;

-- Relax recommendationId to optional. Existing rows all have a non-null
-- value so this is a type-widening, not a data rewrite.
ALTER TABLE "ValidationPage" ALTER COLUMN "recommendationId" DROP NOT NULL;

-- New optional binding columns.
ALTER TABLE "ValidationPage" ADD COLUMN "taskId"    TEXT;
ALTER TABLE "ValidationPage" ADD COLUMN "roadmapId" TEXT;

-- Re-add the recommendationId constraint as a composite table-level unique.
-- Postgres treats NULLs as distinct, so multiple task-bound or
-- truly-standalone pages (recommendationId = NULL) coexist.
CREATE UNIQUE INDEX "ValidationPage_recommendationId_key" ON "ValidationPage"("recommendationId");

-- One page per (roadmap, task). NULL, NULL tuples are permitted by
-- Postgres's NULLS DISTINCT default so standalone pages aren't blocked.
CREATE UNIQUE INDEX "ValidationPage_roadmapId_taskId_key" ON "ValidationPage"("roadmapId", "taskId");

-- Indexes backing the new query patterns.
CREATE INDEX "ValidationPage_taskId_idx"    ON "ValidationPage"("taskId");
CREATE INDEX "ValidationPage_roadmapId_idx" ON "ValidationPage"("roadmapId");

-- Re-add the foreign key with ON DELETE SET NULL so removing a
-- Recommendation no longer cascades to the ValidationPage (pages have
-- survived their source recommendation's lifecycle).
ALTER TABLE "ValidationPage"
  ADD CONSTRAINT "ValidationPage_recommendationId_fkey"
  FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- New foreign key to Roadmap for task-bound pages.
ALTER TABLE "ValidationPage"
  ADD CONSTRAINT "ValidationPage_roadmapId_fkey"
  FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
