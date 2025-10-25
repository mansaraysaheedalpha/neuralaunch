-- CreateTable
CREATE TABLE "LandingPageFeedback" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "sessionId" TEXT,
    "feedbackType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandingPageFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandingPageFeedback_landingPageId_feedbackType_idx" ON "LandingPageFeedback"("landingPageId", "feedbackType");

-- AddForeignKey
ALTER TABLE "LandingPageFeedback" ADD CONSTRAINT "LandingPageFeedback_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
