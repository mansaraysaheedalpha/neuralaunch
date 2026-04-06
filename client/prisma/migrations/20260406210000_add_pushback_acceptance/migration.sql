-- AlterTable
ALTER TABLE "Recommendation"
  ADD COLUMN "acceptedAt"                  TIMESTAMP(3),
  ADD COLUMN "acceptedAtRound"             INTEGER,
  ADD COLUMN "unacceptCount"               INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pushbackHistory"             JSONB   NOT NULL DEFAULT '[]',
  ADD COLUMN "versions"                    JSONB   NOT NULL DEFAULT '[]',
  ADD COLUMN "alternativeRecommendationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_alternativeRecommendationId_key"
  ON "Recommendation"("alternativeRecommendationId");

-- AddForeignKey (self-relation)
ALTER TABLE "Recommendation"
  ADD CONSTRAINT "Recommendation_alternativeRecommendationId_fkey"
  FOREIGN KEY ("alternativeRecommendationId")
  REFERENCES "Recommendation"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
