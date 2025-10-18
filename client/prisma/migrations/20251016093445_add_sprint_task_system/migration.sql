-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE');

-- CreateEnum
CREATE TYPE "AssistantType" AS ENUM ('CUSTOMER_PROFILE', 'OUTREACH_EMAIL', 'LINKEDIN_MESSAGE', 'INTERVIEW_QUESTIONS', 'COMPETITIVE_ANALYSIS', 'PRICING_STRATEGY', 'GENERAL');

-- DropIndex
DROP INDEX "public"."PageView_sessionId_idx";

-- AlterTable
ALTER TABLE "PageView" ADD COLUMN     "ctaClicked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scrollDepth" INTEGER,
ADD COLUMN     "timeOnPage" INTEGER,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT;

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "timeEstimate" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "aiAssistantType" "AssistantType",
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOutput" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskOutput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_conversationId_idx" ON "Task"("conversationId");

-- CreateIndex
CREATE INDEX "TaskOutput_taskId_idx" ON "TaskOutput"("taskId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOutput" ADD CONSTRAINT "TaskOutput_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
