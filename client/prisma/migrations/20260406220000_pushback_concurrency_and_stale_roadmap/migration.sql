-- AlterTable: pushback optimistic-concurrency lock
ALTER TABLE "Recommendation"
  ADD COLUMN "pushbackVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterEnum: STALE roadmap status (set when pushback refines/replaces
-- the parent recommendation after the roadmap was already generated)
ALTER TYPE "RoadmapStatus" ADD VALUE 'STALE';
