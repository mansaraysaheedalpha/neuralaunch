-- Standalone toolkit sessions (sessions opened from the tools menu,
-- not tied to a specific task). Defaults to empty JSON array.
-- Task-level sessions live inside the task's coachSession field in
-- the phases JSONB column; this column is for roadmap-level sessions.

ALTER TABLE "Roadmap"
  ADD COLUMN IF NOT EXISTS "toolSessions" JSONB NOT NULL DEFAULT '[]';
