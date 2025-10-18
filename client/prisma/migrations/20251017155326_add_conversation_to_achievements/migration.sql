/*
  Warnings:

  - A unique constraint covering the columns `[userId,achievementType,conversationId]` on the table `Achievement` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Achievement_userId_achievementType_key";

-- AlterTable
ALTER TABLE "Achievement" ADD COLUMN     "conversationId" TEXT;

-- CreateIndex
CREATE INDEX "Achievement_conversationId_idx" ON "Achievement"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_userId_achievementType_conversationId_key" ON "Achievement"("userId", "achievementType", "conversationId");
