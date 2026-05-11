-- IdeationStageRun — one row per (DiscoverySession × stage) for the
-- "No Idea" archetype's 6-stage ideation flow (stages 0..5).
--
-- The `output` JSONB column is discriminated by `status`:
--   - 'authoring'    → Stage1AuthoringStateSchema (partial state, plus
--                       optional priorCommittedSnapshot for the
--                       edit-discard flow)
--   - 'output_ready' → OutcomeDocumentSchema (composer ran, not yet
--                       frozen)
--   - 'committed'    → OutcomeDocumentSchema (frozen; committedAt set)
--
-- App-code invariant (enforced in commit/edit/discard-edit routes plus
-- the lifecycle test): committedAt IS NOT NULL ⇔ status='committed'.
-- Not modelled as a CHECK constraint so `prisma db pull` round-trips
-- stay clean against the schema.
--
-- See client/src/lib/ideation/ for the schemas and helpers, and the
-- DiscoverySession docstring in schema.prisma for the relation context.

CREATE TABLE "IdeationStageRun" (
  "id"          TEXT         PRIMARY KEY,
  "sessionId"   TEXT         NOT NULL,
  "stageNumber" INTEGER      NOT NULL,
  "status"      TEXT         NOT NULL,
  "output"      JSONB,
  "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "committedAt" TIMESTAMP(3),
  CONSTRAINT "IdeationStageRun_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "DiscoverySession"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- The edit flow reverts the same row from 'committed' back to
-- 'authoring' rather than spawning a new one, so the unique covers
-- the real invariant: one active stage row per (session, stage).
CREATE UNIQUE INDEX "IdeationStageRun_sessionId_stageNumber_key"
  ON "IdeationStageRun"("sessionId", "stageNumber");

-- Hot path: page-load read of all stage runs for a session to decide
-- which stage to render. Covers the "given a session, list its runs"
-- query that DiscoveryPage uses to detect no_idea resumption.
CREATE INDEX "IdeationStageRun_sessionId_idx"
  ON "IdeationStageRun"("sessionId");
