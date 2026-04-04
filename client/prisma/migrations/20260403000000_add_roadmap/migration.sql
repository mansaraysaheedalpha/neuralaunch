-- CreateEnum
CREATE TYPE "RoadmapStatus" AS ENUM ('GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Roadmap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "status" "RoadmapStatus" NOT NULL DEFAULT 'GENERATING',
    "phases" JSONB NOT NULL,
    "closingThought" TEXT,
    "weeklyHours" INTEGER,
    "totalWeeks" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roadmap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Roadmap_recommendationId_key" ON "Roadmap"("recommendationId");

-- CreateIndex
CREATE INDEX "Roadmap_userId_idx" ON "Roadmap"("userId");

-- CreateIndex
CREATE INDEX "Roadmap_recommendationId_idx" ON "Roadmap"("recommendationId");

-- AddForeignKey
ALTER TABLE "Roadmap" ADD CONSTRAINT "Roadmap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roadmap" ADD CONSTRAINT "Roadmap_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
