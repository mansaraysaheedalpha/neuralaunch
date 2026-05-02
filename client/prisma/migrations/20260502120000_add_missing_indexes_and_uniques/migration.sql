-- Migration: add_missing_indexes_and_uniques
--
-- Adds the composite indexes for the four hot list queries that today
-- run as index-range + in-memory sort, promotes a drift index into the
-- schema, drops four redundant indexes, and enforces three integrity
-- invariants (TierTransition.paddleEventId unique, ToolJob unique on
-- (sessionId, toolType), Cycle unique on (ventureId, cycleNumber)).
-- Also adds the missing FK on Cycle.roadmapId.
--
-- All index creations use IF NOT EXISTS so the drift index that was
-- created in 20260405000000_add_session_persistence_fields/migration.sql
-- but never declared in schema.prisma is a no-op when re-applied.
--
-- Pre-flight cleanup required before applying in prod (see notes at
-- the bottom of this file): the unique constraints will fail if any
-- duplicate (sessionId, toolType) ToolJob rows or duplicate
-- (ventureId, cycleNumber) Cycle rows exist. Run the duplicate-detection
-- queries below in a shadow environment first.

-- =========================================================================
-- 1. New composite indexes for hot list queries
-- =========================================================================

-- Recommendation sidebar + tools/validation list
CREATE INDEX IF NOT EXISTS "Recommendation_userId_createdAt_idx"
  ON "Recommendation" ("userId", "createdAt" DESC);

-- Validation dashboard list
CREATE INDEX IF NOT EXISTS "ValidationPage_userId_updatedAt_idx"
  ON "ValidationPage" ("userId", "updatedAt" DESC);

-- Sessions tab + /api/discovery/ventures
CREATE INDEX IF NOT EXISTS "Venture_userId_updatedAt_idx"
  ON "Venture" ("userId", "updatedAt" DESC);

-- Tool job active-jobs poll (3-30s cadence). Supersedes the old
-- (userId, stage) index — same predicate plus the order key.
CREATE INDEX IF NOT EXISTS "ToolJob_userId_stage_startedAt_idx"
  ON "ToolJob" ("userId", "stage", "startedAt" DESC);

-- =========================================================================
-- 2. Promote drift index (created in 20260405000000 but never in schema)
-- =========================================================================
-- Already exists in production — IF NOT EXISTS makes this a no-op there.
-- In environments that were created from schema.prisma (CI shadow,
-- fresh local dev), this is the first time the index is created.
CREATE INDEX IF NOT EXISTS "DiscoverySession_userId_status_lastTurnAt_idx"
  ON "DiscoverySession" ("userId", "status", "lastTurnAt" DESC);

-- =========================================================================
-- 3. Drop redundant indexes
-- =========================================================================

-- Conversation.createdAt — every read predicate carries userId, so the
-- (userId, createdAt) composite covers every query; the standalone is
-- never used.
DROP INDEX IF EXISTS "Conversation_createdAt_idx";

-- Roadmap.recommendationId is already @unique → btree index already exists
-- under "Roadmap_recommendationId_key". The separate non-unique index is
-- redundant and bloats writes.
DROP INDEX IF EXISTS "Roadmap_recommendationId_idx";

-- ValidationPage.slug is already @unique → btree index already exists
-- under "ValidationPage_slug_key".
DROP INDEX IF EXISTS "ValidationPage_slug_idx";

-- ValidationPage.recommendationId is already @unique([recommendationId])
-- → btree index already exists under "ValidationPage_recommendationId_key".
DROP INDEX IF EXISTS "ValidationPage_recommendationId_idx";

-- ToolJob (userId, stage) is now a strict prefix of the new
-- (userId, stage, startedAt DESC) index. Drop the prefix.
DROP INDEX IF EXISTS "ToolJob_userId_stage_idx";

-- ToolJob (sessionId) standalone index is redundant once the new unique
-- on (sessionId, toolType) is in place — Postgres can use the leading
-- column of the unique btree to satisfy any sessionId-only predicate.
DROP INDEX IF EXISTS "ToolJob_sessionId_idx";

-- Cycle (ventureId, cycleNumber) is being upgraded to a UNIQUE index in
-- step 4 below. Drop the plain index first so the unique can take its place.
DROP INDEX IF EXISTS "Cycle_ventureId_cycleNumber_idx";

-- =========================================================================
-- 4. Enforce integrity invariants via UNIQUE constraints
-- =========================================================================

-- TierTransition.paddleEventId — partial unique on non-null values.
-- A Paddle webhook redelivery (Paddle retries on any 5xx) carries the
-- same eventId. Without this, recordTierTransition writes a duplicate
-- audit row on every redelivery. The route catch should translate the
-- resulting P2002 into a 200 ack so Paddle stops retrying.
-- Manual operator-driven transitions write paddleEventId=NULL and are
-- exempted by the WHERE clause.
CREATE UNIQUE INDEX IF NOT EXISTS "TierTransition_paddleEventId_key"
  ON "TierTransition" ("paddleEventId")
  WHERE "paddleEventId" IS NOT NULL;

-- ToolJob (sessionId, toolType) — sessionId is the result-address
-- pre-allocated by the route; one (sessionId, toolType) tuple should
-- map to one in-flight job. Prevents a route bug from double-allocating
-- and producing two competing rows that both try to write the same
-- toolSessions[] entry.
-- NOTE: this CREATE will fail if any duplicate tuple exists in prod.
-- Run the detection query at the bottom of this file first.
CREATE UNIQUE INDEX IF NOT EXISTS "ToolJob_sessionId_toolType_key"
  ON "ToolJob" ("sessionId", "toolType");

-- Cycle (ventureId, cycleNumber) — exactly one cycle per ordinal
-- per venture. Today the application enforces this in a transaction;
-- adding the DB constraint protects against a regression that double-
-- creates cycles 2,2 instead of 2,3.
-- NOTE: this CREATE will fail if any duplicate tuple exists in prod.
CREATE UNIQUE INDEX IF NOT EXISTS "Cycle_ventureId_cycleNumber_key"
  ON "Cycle" ("ventureId", "cycleNumber");

-- =========================================================================
-- 5. Foreign key — Cycle.roadmapId → Roadmap.id (SetNull on delete)
-- =========================================================================
-- Today Cycle.roadmapId is a plain TEXT column with no referential
-- integrity. Deleting a Roadmap leaves dangling Cycle.roadmapId values.
-- SetNull because a deleted roadmap should not cascade-delete its
-- cycle (the cycle's evidence outlives the roadmap row).
--
-- Index on Cycle.roadmapId is added by the schema-driven @@index above
-- (Cycle_roadmapId_idx) — Postgres needs that to satisfy the FK
-- check efficiently, but a non-unique index is enough.
CREATE INDEX IF NOT EXISTS "Cycle_roadmapId_idx"
  ON "Cycle" ("roadmapId");

ALTER TABLE "Cycle"
  DROP CONSTRAINT IF EXISTS "Cycle_roadmapId_fkey";

ALTER TABLE "Cycle"
  ADD CONSTRAINT "Cycle_roadmapId_fkey"
  FOREIGN KEY ("roadmapId")
  REFERENCES "Roadmap"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- =========================================================================
-- Pre-flight detection queries (run in a shadow env BEFORE applying)
-- =========================================================================
--
-- Duplicate ToolJob (sessionId, toolType) tuples — must return 0 rows:
--   SELECT "sessionId", "toolType", COUNT(*)
--   FROM "ToolJob"
--   GROUP BY "sessionId", "toolType"
--   HAVING COUNT(*) > 1;
--
-- Duplicate Cycle (ventureId, cycleNumber) tuples — must return 0 rows:
--   SELECT "ventureId", "cycleNumber", COUNT(*)
--   FROM "Cycle"
--   GROUP BY "ventureId", "cycleNumber"
--   HAVING COUNT(*) > 1;
--
-- Dangling Cycle.roadmapId references — should be NULLed pre-FK:
--   UPDATE "Cycle" c
--   SET "roadmapId" = NULL
--   WHERE "roadmapId" IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM "Roadmap" r WHERE r."id" = c."roadmapId");
--
-- Duplicate TierTransition.paddleEventId values (non-null) — keep the
-- earliest, drop the rest before the unique kicks in:
--   SELECT "paddleEventId", COUNT(*)
--   FROM "TierTransition"
--   WHERE "paddleEventId" IS NOT NULL
--   GROUP BY "paddleEventId"
--   HAVING COUNT(*) > 1;
