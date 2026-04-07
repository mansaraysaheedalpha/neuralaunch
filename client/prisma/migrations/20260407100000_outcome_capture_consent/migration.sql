-- AlterTable: training-data consent on User
ALTER TABLE "User"
  ADD COLUMN "trainingConsent"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trainingConsentAt"  TIMESTAMP(3);

-- AlterTable: outcome-prompt trigger state on RoadmapProgress
ALTER TABLE "RoadmapProgress"
  ADD COLUMN "outcomePromptPending"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "outcomePromptSkippedAt" TIMESTAMP(3);

CREATE INDEX "RoadmapProgress_outcomePromptPending_idx"
  ON "RoadmapProgress"("outcomePromptPending");

-- CreateTable
CREATE TABLE "RecommendationOutcome" (
    "id"                  TEXT          NOT NULL,
    "recommendationId"    TEXT          NOT NULL,
    "userId"              TEXT          NOT NULL,
    "outcomeType"         TEXT          NOT NULL,
    "freeText"            TEXT,
    "weakPhases"          TEXT[]        DEFAULT ARRAY[]::TEXT[],
    "consentedToTraining" BOOLEAN       NOT NULL,
    "anonymisedRecord"    JSONB,
    "submittedAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationOutcome_recommendationId_key"
  ON "RecommendationOutcome"("recommendationId");
CREATE INDEX "RecommendationOutcome_userId_idx"
  ON "RecommendationOutcome"("userId");
CREATE INDEX "RecommendationOutcome_outcomeType_idx"
  ON "RecommendationOutcome"("outcomeType");
CREATE INDEX "RecommendationOutcome_submittedAt_idx"
  ON "RecommendationOutcome"("submittedAt");

-- AddForeignKey
ALTER TABLE "RecommendationOutcome"
  ADD CONSTRAINT "RecommendationOutcome_recommendationId_fkey"
  FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecommendationOutcome"
  ADD CONSTRAINT "RecommendationOutcome_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
