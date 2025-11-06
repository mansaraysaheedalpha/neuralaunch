-- AlterTable
ALTER TABLE "LandingPage" ADD COLUMN     "agentArchitectPreferences" JSONB,
ADD COLUMN     "agentArchitecturePlan" JSONB,
ADD COLUMN     "projectPlatform" TEXT,
ADD COLUMN     "projectPrimaryLanguage" TEXT,
ADD COLUMN     "sandboxHostPort" TEXT;
