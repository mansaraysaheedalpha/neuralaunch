-- AlterTable
ALTER TABLE "LandingPage" ADD COLUMN     "agentRequiredEnvKeys" JSONB,
ADD COLUMN     "encryptedEnvVars" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vercelTeamId" TEXT;

-- CreateIndex
CREATE INDEX "LandingPage_userId_agentStatus_idx" ON "LandingPage"("userId", "agentStatus");

-- CreateIndex
CREATE INDEX "LandingPage_sandboxContainerId_idx" ON "LandingPage"("sandboxContainerId");

-- CreateIndex
CREATE INDEX "LandingPage_sandboxLastAccessedAt_idx" ON "LandingPage"("sandboxLastAccessedAt");
