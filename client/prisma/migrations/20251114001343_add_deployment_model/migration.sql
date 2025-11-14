-- AlterTable
ALTER TABLE "ExecutionWave" ADD COLUMN     "criticalIssuesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "escalatedToHuman" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "escalationReason" TEXT,
ADD COLUMN     "finalReviewScore" INTEGER,
ADD COLUMN     "fixAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFixAttempt" TIMESTAMP(3),
ADD COLUMN     "mediumIssuesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "previewDeployedAt" TIMESTAMP(3),
ADD COLUMN     "previewUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "thoughtPreferences" JSONB;

-- CreateTable
CREATE TABLE "CriticalFailure" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "waveNumber" INTEGER,
    "phase" TEXT NOT NULL,
    "component" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "rootCause" TEXT,
    "severity" TEXT NOT NULL,
    "issuesFound" JSONB NOT NULL,
    "issuesRemaining" JSONB NOT NULL,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "attemptHistory" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "escalatedToHuman" BOOLEAN NOT NULL DEFAULT false,
    "escalatedAt" TIMESTAMP(3),
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "notificationSentAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "resolvedBy" TEXT,
    "stackTrace" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CriticalFailure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "healthStatus" TEXT NOT NULL,
    "uptime" DOUBLE PRECISION NOT NULL,
    "avgResponseTime" DOUBLE PRECISION NOT NULL,
    "errorRate" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueFixAttempt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "waveNumber" INTEGER NOT NULL,
    "taskId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "issuesFound" JSONB NOT NULL,
    "fixStrategy" TEXT NOT NULL,
    "agentUsed" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "durationMs" INTEGER,
    "tokensUsed" INTEGER,
    "issuesResolved" INTEGER NOT NULL DEFAULT 0,
    "issuesRemaining" INTEGER NOT NULL DEFAULT 0,
    "newIssuesCreated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueFixAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanReviewRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "waveNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'high',
    "criticalIssues" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedTo" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "resolverNotes" TEXT,
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "notificationSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentThought" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentThought_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deploymentUrl" TEXT,
    "adminUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "buildStatus" TEXT,
    "deployedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "commitSha" TEXT,
    "branch" TEXT,
    "buildDuration" INTEGER,
    "buildLogs" TEXT,
    "errorMessage" TEXT,
    "waveNumber" INTEGER,
    "platformDeploymentId" TEXT,
    "platformProjectId" TEXT,
    "envVars" JSONB,
    "buildCommand" TEXT,
    "startCommand" TEXT,
    "buildSize" INTEGER,
    "functionCount" INTEGER,
    "requestCount" INTEGER,
    "triggeredBy" TEXT,
    "deploymentType" TEXT NOT NULL DEFAULT 'automated',
    "previousDeploymentId" TEXT,
    "isRollback" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CriticalFailure_projectId_idx" ON "CriticalFailure"("projectId");

-- CreateIndex
CREATE INDEX "CriticalFailure_userId_idx" ON "CriticalFailure"("userId");

-- CreateIndex
CREATE INDEX "CriticalFailure_status_idx" ON "CriticalFailure"("status");

-- CreateIndex
CREATE INDEX "CriticalFailure_severity_idx" ON "CriticalFailure"("severity");

-- CreateIndex
CREATE INDEX "CriticalFailure_escalatedToHuman_idx" ON "CriticalFailure"("escalatedToHuman");

-- CreateIndex
CREATE INDEX "CriticalFailure_projectId_status_idx" ON "CriticalFailure"("projectId", "status");

-- CreateIndex
CREATE INDEX "CriticalFailure_projectId_waveNumber_idx" ON "CriticalFailure"("projectId", "waveNumber");

-- CreateIndex
CREATE INDEX "CriticalFailure_createdAt_idx" ON "CriticalFailure"("createdAt");

-- CreateIndex
CREATE INDEX "MonitoringSnapshot_projectId_timestamp_idx" ON "MonitoringSnapshot"("projectId", "timestamp");

-- CreateIndex
CREATE INDEX "IssueFixAttempt_projectId_waveNumber_idx" ON "IssueFixAttempt"("projectId", "waveNumber");

-- CreateIndex
CREATE INDEX "IssueFixAttempt_taskId_idx" ON "IssueFixAttempt"("taskId");

-- CreateIndex
CREATE INDEX "IssueFixAttempt_attempt_idx" ON "IssueFixAttempt"("attempt");

-- CreateIndex
CREATE INDEX "IssueFixAttempt_success_idx" ON "IssueFixAttempt"("success");

-- CreateIndex
CREATE INDEX "HumanReviewRequest_projectId_idx" ON "HumanReviewRequest"("projectId");

-- CreateIndex
CREATE INDEX "HumanReviewRequest_status_idx" ON "HumanReviewRequest"("status");

-- CreateIndex
CREATE INDEX "HumanReviewRequest_priority_idx" ON "HumanReviewRequest"("priority");

-- CreateIndex
CREATE INDEX "HumanReviewRequest_createdAt_idx" ON "HumanReviewRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HumanReviewRequest_projectId_waveNumber_key" ON "HumanReviewRequest"("projectId", "waveNumber");

-- CreateIndex
CREATE INDEX "AgentThought_projectId_timestamp_idx" ON "AgentThought"("projectId", "timestamp");

-- CreateIndex
CREATE INDEX "AgentThought_projectId_agentName_idx" ON "AgentThought"("projectId", "agentName");

-- CreateIndex
CREATE INDEX "Deployment_projectId_idx" ON "Deployment"("projectId");

-- CreateIndex
CREATE INDEX "Deployment_projectId_environment_idx" ON "Deployment"("projectId", "environment");

-- CreateIndex
CREATE INDEX "Deployment_projectId_waveNumber_idx" ON "Deployment"("projectId", "waveNumber");

-- CreateIndex
CREATE INDEX "Deployment_status_idx" ON "Deployment"("status");

-- CreateIndex
CREATE INDEX "Deployment_environment_idx" ON "Deployment"("environment");

-- CreateIndex
CREATE INDEX "Deployment_deployedAt_idx" ON "Deployment"("deployedAt");

-- CreateIndex
CREATE INDEX "Deployment_createdAt_idx" ON "Deployment"("createdAt");

-- CreateIndex
CREATE INDEX "ExecutionWave_escalatedToHuman_idx" ON "ExecutionWave"("escalatedToHuman");
