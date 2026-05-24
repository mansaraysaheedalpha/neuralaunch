-- IdeationStage5Job — durable execution row for the Stage 5 (No Idea
-- archetype) synthesis bridge. Separate from ToolJob because Stage 5
-- runs BEFORE any roadmap exists (it produces the Recommendation row
-- that the roadmap is later generated from) — ToolJob's mandatory
-- roadmapId would be a nullable hack and its persistToolJobResult
-- writes into roadmap.toolSessions, which is the wrong shape for a
-- Recommendation handoff.
--
-- Lifecycle stages (worker writes these via updateStage5JobStage):
--   queued → loading_inputs → synthesizing → persisting → succeeded
--                                                       → failed
-- Terminal stages: 'succeeded', 'failed'. The status endpoint flips
-- the client's polling loop off once it observes either.

CREATE TABLE IF NOT EXISTS "IdeationStage5Job" (
  "id"               TEXT         PRIMARY KEY,
  "userId"           TEXT         NOT NULL,
  "sessionId"        TEXT         NOT NULL,
  "stage"            TEXT         NOT NULL DEFAULT 'queued',
  "errorMessage"     TEXT,
  "recommendationId" TEXT,
  "startedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  "completedAt"      TIMESTAMP(3)
);

-- Hot path: status endpoint reads by (sessionId, jobId) and the dedup
-- helper scans for open jobs by sessionId. Leading-sessionId composite
-- covers both.
CREATE INDEX IF NOT EXISTS "IdeationStage5Job_sessionId_idx"
  ON "IdeationStage5Job"("sessionId");

-- Ownership-scoped lookup for active-jobs banners and admin queries.
CREATE INDEX IF NOT EXISTS "IdeationStage5Job_userId_stage_idx"
  ON "IdeationStage5Job"("userId", "stage");

-- Partial unique: at most one in-flight job per session at a time.
-- Prisma's schema language cannot express partial uniques, so the
-- invariant is enforced here in SQL. The accept-and-queue route's
-- dedup check (findFirst on non-terminal stages) is the application-
-- layer guard; this index is the database-layer backstop that turns a
-- racing duplicate INSERT into a clean P2002 instead of two competing
-- workers.
CREATE UNIQUE INDEX IF NOT EXISTS "IdeationStage5Job_sessionId_open_unique"
  ON "IdeationStage5Job"("sessionId")
  WHERE "stage" NOT IN ('succeeded', 'failed');
