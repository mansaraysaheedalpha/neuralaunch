-- AlterTable
ALTER TABLE "EmailSignup" ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "LandingPage" ADD COLUMN     "abTestVariants" JSONB,
ADD COLUMN     "preorderLink" TEXT;

-- CreateTable
CREATE TABLE "FeatureSmokeTest" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "featureName" TEXT NOT NULL,
    "sessionId" TEXT,
    "clickCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureSmokeTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureSmokeTest_landingPageId_idx" ON "FeatureSmokeTest"("landingPageId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureSmokeTest_landingPageId_featureName_sessionId_key" ON "FeatureSmokeTest"("landingPageId", "featureName", "sessionId");

-- AddForeignKey
ALTER TABLE "FeatureSmokeTest" ADD CONSTRAINT "FeatureSmokeTest_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
