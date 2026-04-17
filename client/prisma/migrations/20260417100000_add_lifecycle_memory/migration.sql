-- ============================================================================
-- Lifecycle memory architecture
--
-- Adds three new tables (FounderProfile, Venture, Cycle) that implement the
-- three-layer memory model described in docs/neuralaunch-lifecycle-memory.md.
-- Also adds nullable foreign keys on Recommendation.cycleId and
-- Roadmap.ventureId for query convenience.
--
-- All additions are backwards-compatible:
--   - The three new tables start empty.
--   - Recommendation.cycleId and Roadmap.ventureId are nullable; existing
--     rows stay null until the Phase 8 backfill script groups them into
--     ventures/cycles.
--   - No existing data is altered; no application code changes required
--     for the migration itself to apply cleanly.
-- ============================================================================

-- CreateTable: FounderProfile
CREATE TABLE "FounderProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "lastUpdatedByCycleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FounderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Venture
CREATE TABLE "Venture" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentCycleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venture_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Cycle
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "ventureId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "roadmapId" TEXT,
    "summary" JSONB,
    "selectedForkIndex" INTEGER,
    "selectedForkSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Recommendation — add cycleId
ALTER TABLE "Recommendation" ADD COLUMN "cycleId" TEXT;

-- AlterTable: Roadmap — add ventureId
ALTER TABLE "Roadmap" ADD COLUMN "ventureId" TEXT;

-- Unique indexes
CREATE UNIQUE INDEX "FounderProfile_userId_key" ON "FounderProfile"("userId");
CREATE UNIQUE INDEX "Recommendation_cycleId_key" ON "Recommendation"("cycleId");

-- Regular indexes
CREATE INDEX "Venture_userId_idx" ON "Venture"("userId");
CREATE INDEX "Venture_userId_status_idx" ON "Venture"("userId", "status");
CREATE INDEX "Cycle_ventureId_idx" ON "Cycle"("ventureId");
CREATE INDEX "Cycle_ventureId_cycleNumber_idx" ON "Cycle"("ventureId", "cycleNumber");
CREATE INDEX "Recommendation_cycleId_idx" ON "Recommendation"("cycleId");
CREATE INDEX "Roadmap_ventureId_idx" ON "Roadmap"("ventureId");

-- Foreign keys
ALTER TABLE "FounderProfile" ADD CONSTRAINT "FounderProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Venture" ADD CONSTRAINT "Venture_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_ventureId_fkey"
    FOREIGN KEY ("ventureId") REFERENCES "Venture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_cycleId_fkey"
    FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Roadmap" ADD CONSTRAINT "Roadmap_ventureId_fkey"
    FOREIGN KEY ("ventureId") REFERENCES "Venture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
