-- AlterTable
ALTER TABLE "AgentTask" ADD COLUMN     "criticalIssues" INTEGER,
ADD COLUMN     "reviewApproved" BOOLEAN,
ADD COLUMN     "reviewScore" INTEGER,
ADD COLUMN     "securityScore" INTEGER;

-- AlterTable
ALTER TABLE "ProjectContext" ADD COLUMN     "planApprovalStatus" TEXT DEFAULT 'pending',
ADD COLUMN     "planFeedback" JSONB,
ADD COLUMN     "planRevisionCount" INTEGER NOT NULL DEFAULT 0;
