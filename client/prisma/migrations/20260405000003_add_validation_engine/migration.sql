-- Phase 3: Add Validation Engine models
-- ValidationStatus enum
CREATE TYPE "ValidationStatus" AS ENUM ('DRAFT', 'LIVE', 'ARCHIVED');

-- ValidationPage
CREATE TABLE "ValidationPage" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "recommendationId"  TEXT NOT NULL,
    "slug"              TEXT NOT NULL,
    "status"            "ValidationStatus" NOT NULL DEFAULT 'DRAFT',
    "layoutVariant"     TEXT NOT NULL,
    "content"           JSONB NOT NULL,
    "distributionBrief" JSONB,
    "channelsCompleted" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "posthogPropertyId" TEXT,
    "publishedAt"       TIMESTAMP(3),
    "archivedAt"        TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValidationPage_pkey" PRIMARY KEY ("id")
);

-- ValidationSnapshot
CREATE TABLE "ValidationSnapshot" (
    "id"                 TEXT NOT NULL,
    "validationPageId"   TEXT NOT NULL,
    "takenAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitorCount"       INTEGER NOT NULL DEFAULT 0,
    "uniqueVisitorCount" INTEGER NOT NULL DEFAULT 0,
    "ctaConversionRate"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "featureClicks"      JSONB NOT NULL,
    "surveyResponses"    JSONB NOT NULL,
    "trafficSources"     JSONB NOT NULL,
    "scrollDepthData"    JSONB NOT NULL,
    "interpretation"     JSONB,

    CONSTRAINT "ValidationSnapshot_pkey" PRIMARY KEY ("id")
);

-- ValidationReport
CREATE TABLE "ValidationReport" (
    "id"                TEXT NOT NULL,
    "validationPageId"  TEXT NOT NULL,
    "snapshotId"        TEXT NOT NULL,
    "generatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signalStrength"    TEXT NOT NULL,
    "confirmedFeatures" JSONB NOT NULL,
    "rejectedFeatures"  JSONB NOT NULL,
    "surveyInsights"    TEXT NOT NULL,
    "buildBrief"        TEXT NOT NULL,
    "nextAction"        TEXT NOT NULL,
    "usedForMvp"        BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ValidationReport_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "ValidationPage_recommendationId_key" ON "ValidationPage"("recommendationId");
CREATE UNIQUE INDEX "ValidationPage_slug_key" ON "ValidationPage"("slug");
CREATE UNIQUE INDEX "ValidationReport_validationPageId_key" ON "ValidationReport"("validationPageId");

-- Indexes
CREATE INDEX "ValidationPage_userId_idx" ON "ValidationPage"("userId");
CREATE INDEX "ValidationPage_slug_idx" ON "ValidationPage"("slug");
CREATE INDEX "ValidationPage_status_idx" ON "ValidationPage"("status");
CREATE INDEX "ValidationPage_recommendationId_idx" ON "ValidationPage"("recommendationId");
CREATE INDEX "ValidationSnapshot_validationPageId_idx" ON "ValidationSnapshot"("validationPageId");
CREATE INDEX "ValidationSnapshot_takenAt_idx" ON "ValidationSnapshot"("takenAt");
CREATE INDEX "ValidationReport_validationPageId_idx" ON "ValidationReport"("validationPageId");

-- Foreign keys
ALTER TABLE "ValidationPage" ADD CONSTRAINT "ValidationPage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ValidationPage" ADD CONSTRAINT "ValidationPage_recommendationId_fkey"
    FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ValidationSnapshot" ADD CONSTRAINT "ValidationSnapshot_validationPageId_fkey"
    FOREIGN KEY ("validationPageId") REFERENCES "ValidationPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ValidationReport" ADD CONSTRAINT "ValidationReport_validationPageId_fkey"
    FOREIGN KEY ("validationPageId") REFERENCES "ValidationPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
