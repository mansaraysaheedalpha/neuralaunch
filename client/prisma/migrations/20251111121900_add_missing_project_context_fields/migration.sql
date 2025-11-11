-- AlterTable: Add missing fields to ProjectContext
ALTER TABLE "ProjectContext" ADD COLUMN IF NOT EXISTS "documentationGenerated" BOOLEAN DEFAULT false;
ALTER TABLE "ProjectContext" ADD COLUMN IF NOT EXISTS "documentationGeneratedAt" TIMESTAMP(3);
ALTER TABLE "ProjectContext" ADD COLUMN IF NOT EXISTS "lastReviewScore" INTEGER;
ALTER TABLE "ProjectContext" ADD COLUMN IF NOT EXISTS "totalEscalations" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProjectContext" ADD COLUMN IF NOT EXISTS "lastEscalationAt" TIMESTAMP(3);
ALTER TABLE "ProjectContext" ADD COLUMN IF NOT EXISTS "humanReviewRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: Add missing indexes
CREATE INDEX IF NOT EXISTS "ProjectContext_humanReviewRequired_idx" ON "ProjectContext"("humanReviewRequired");

-- AlterTable: Add missing fields to AgentTask
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "prNumber" INTEGER;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "branchName" TEXT;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "waveNumber" INTEGER;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "complexity" TEXT;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "estimatedLines" INTEGER;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "prUrl" TEXT;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "fixAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "lastFixedAt" TIMESTAMP(3);
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "fixHistory" JSONB;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "originalIssues" JSONB;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "remainingIssues" JSONB;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: Add missing indexes for AgentTask
CREATE INDEX IF NOT EXISTS "AgentTask_projectId_status_idx" ON "AgentTask"("projectId", "status");
CREATE INDEX IF NOT EXISTS "AgentTask_projectId_waveNumber_idx" ON "AgentTask"("projectId", "waveNumber");
CREATE INDEX IF NOT EXISTS "AgentTask_reviewStatus_idx" ON "AgentTask"("reviewStatus");
CREATE INDEX IF NOT EXISTS "AgentTask_fixAttempts_idx" ON "AgentTask"("fixAttempts");
