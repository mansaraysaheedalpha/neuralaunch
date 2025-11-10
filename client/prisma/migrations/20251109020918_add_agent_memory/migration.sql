-- AlterTable
ALTER TABLE "AgentTask" ADD COLUMN     "branchName" TEXT,
ADD COLUMN     "complexity" TEXT,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "estimatedLines" INTEGER,
ADD COLUMN     "prNumber" INTEGER,
ADD COLUMN     "prUrl" TEXT,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewStatus" TEXT,
ADD COLUMN     "waveNumber" INTEGER;

-- CreateTable
CREATE TABLE "ExecutionWave" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "waveNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "taskCount" INTEGER NOT NULL,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExecutionWave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "taskTitle" TEXT NOT NULL,
    "taskDescription" TEXT NOT NULL,
    "techStack" JSONB NOT NULL,
    "complexity" TEXT NOT NULL,
    "estimatedLines" INTEGER,
    "success" BOOLEAN NOT NULL,
    "iterations" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "filesCreated" JSONB,
    "codeSnippets" JSONB,
    "commandsRun" JSONB,
    "learnings" JSONB NOT NULL,
    "errorsSolved" JSONB,
    "bestPractices" JSONB,
    "embedding" vector(3072),
    "projectId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExecutionWave_projectId_idx" ON "ExecutionWave"("projectId");

-- CreateIndex
CREATE INDEX "ExecutionWave_status_idx" ON "ExecutionWave"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionWave_projectId_waveNumber_key" ON "ExecutionWave"("projectId", "waveNumber");

-- CreateIndex
CREATE INDEX "AgentMemory_agentName_idx" ON "AgentMemory"("agentName");

-- CreateIndex
CREATE INDEX "AgentMemory_taskType_idx" ON "AgentMemory"("taskType");

-- CreateIndex
CREATE INDEX "AgentMemory_success_idx" ON "AgentMemory"("success");

-- CreateIndex
CREATE INDEX "AgentMemory_agentName_taskType_idx" ON "AgentMemory"("agentName", "taskType");

-- CreateIndex
CREATE INDEX "AgentMemory_createdAt_idx" ON "AgentMemory"("createdAt");

-- CreateIndex
CREATE INDEX "AgentTask_projectId_status_idx" ON "AgentTask"("projectId", "status");

-- CreateIndex
CREATE INDEX "AgentTask_projectId_waveNumber_idx" ON "AgentTask"("projectId", "waveNumber");

-- CreateIndex
CREATE INDEX "AgentTask_reviewStatus_idx" ON "AgentTask"("reviewStatus");
