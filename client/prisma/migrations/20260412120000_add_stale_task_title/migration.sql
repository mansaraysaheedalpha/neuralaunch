-- A11: persist the exact title of the stale task that the proactive
-- nudge cron flagged. The cron job knows which specific task is
-- stale (it walks in-progress tasks comparing startedAt + timeEstimate
-- against the wall clock) but the NudgeBanner historically re-derived
-- "the first in-progress task" by walking the phases — which could
-- name a different task than the one the cron actually flagged when
-- a founder had multiple in-progress tasks.
--
-- Persisting the title here makes the banner read ground truth.
--
-- Backward compatibility: nullable column with no backfill. Rows
-- flagged before this migration have staleTaskTitle = NULL and the
-- NudgeBanner falls back to the legacy walk-the-phases logic for
-- those rows. The check-in route clears this column alongside
-- nudgePending whenever the founder submits any check-in, so the
-- column resets to NULL on the next interaction even if it was
-- never populated.

ALTER TABLE "RoadmapProgress"
  ADD COLUMN IF NOT EXISTS "staleTaskTitle" TEXT;
