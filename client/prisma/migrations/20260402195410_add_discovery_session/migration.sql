-- CreateEnum
CREATE TYPE "DiscoverySessionStatus" AS ENUM ('ACTIVE', 'COMPLETE', 'EXPIRED');

-- AlterTable: add back-relations (no DDL needed — handled by FK on child tables)

-- CreateTable
CREATE TABLE "DiscoverySession" (
    "id"               TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "status"           "DiscoverySessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "phase"            TEXT NOT NULL DEFAULT 'ORIENTATION',
    "questionCount"    INTEGER NOT NULL DEFAULT 0,
    "questionsInPhase" INTEGER NOT NULL DEFAULT 0,
    "activeField"      TEXT,
    "beliefState"      JSONB NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    "completedAt"      TIMESTAMP(3),

    CONSTRAINT "DiscoverySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id"                     TEXT NOT NULL,
    "userId"                 TEXT NOT NULL,
    "sessionId"              TEXT NOT NULL,
    "path"                   TEXT NOT NULL,
    "reasoning"              TEXT NOT NULL,
    "firstThreeSteps"        JSONB NOT NULL,
    "timeToFirstResult"      TEXT NOT NULL,
    "risks"                  JSONB NOT NULL,
    "assumptions"            JSONB NOT NULL,
    "whatWouldMakeThisWrong" TEXT NOT NULL,
    "alternativeRejected"    JSONB NOT NULL,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoverySession_userId_idx" ON "DiscoverySession"("userId");

-- CreateIndex
CREATE INDEX "DiscoverySession_userId_status_idx" ON "DiscoverySession"("userId", "status");

-- CreateIndex
CREATE INDEX "DiscoverySession_createdAt_idx" ON "DiscoverySession"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_sessionId_key" ON "Recommendation"("sessionId");

-- CreateIndex
CREATE INDEX "Recommendation_userId_idx" ON "Recommendation"("userId");

-- CreateIndex
CREATE INDEX "Recommendation_sessionId_idx" ON "Recommendation"("sessionId");

-- AddForeignKey
ALTER TABLE "DiscoverySession" ADD CONSTRAINT "DiscoverySession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "DiscoverySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
