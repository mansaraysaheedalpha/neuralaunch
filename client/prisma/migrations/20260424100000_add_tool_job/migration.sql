-- ToolJob — durable execution row for long-running LLM tool calls.
--
-- Created when a founder fires Research execute / followup, Composer
-- generate / regenerate, Coach prepare / debrief, or Packager generate
-- / adjust. The route returns 202 immediately with the jobId; an
-- Inngest function picks up the work, updates `stage` as it progresses,
-- writes the result into roadmap.toolSessions on completion, and fires
-- a push notification regardless of whether the user is still on the
-- page.
--
-- See docs/inngest-tools-migration-plan-2026-04-24.md for the
-- migration plan and stage definitions.

CREATE TABLE IF NOT EXISTS "ToolJob" (
  "id"           TEXT        PRIMARY KEY,
  "userId"       TEXT        NOT NULL,
  "roadmapId"    TEXT        NOT NULL,
  "toolType"     TEXT        NOT NULL,
  "sessionId"    TEXT        NOT NULL,
  "taskId"       TEXT,
  "stage"        TEXT        NOT NULL DEFAULT 'queued',
  "errorMessage" TEXT,
  "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "completedAt"  TIMESTAMP(3),
  CONSTRAINT "ToolJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Hot path: "show me my in-flight jobs" (background-jobs banner +
-- progress UI). Composite index on (userId, stage) covers both the
-- single-job lookup and the in-flight scan.
CREATE INDEX IF NOT EXISTS "ToolJob_userId_stage_idx"
  ON "ToolJob"("userId", "stage");

-- Roadmap-scoped lookups (e.g. when reading all jobs for a session).
CREATE INDEX IF NOT EXISTS "ToolJob_roadmapId_idx"
  ON "ToolJob"("roadmapId");

-- Used by the result-completion path: given a sessionId, find the
-- job that built it.
CREATE INDEX IF NOT EXISTS "ToolJob_sessionId_idx"
  ON "ToolJob"("sessionId");
