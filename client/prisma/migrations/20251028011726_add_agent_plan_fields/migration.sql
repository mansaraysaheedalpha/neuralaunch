-- AlterTable
ALTER TABLE "LandingPage" ADD COLUMN     "agentClarificationQuestions" JSONB,
ADD COLUMN     "agentCurrentStep" INTEGER,
ADD COLUMN     "agentPlan" JSONB,
ADD COLUMN     "agentStatus" TEXT,
ADD COLUMN     "agentUserResponses" JSONB,
ADD COLUMN     "sandboxLastAccessedAt" TIMESTAMP(3);
