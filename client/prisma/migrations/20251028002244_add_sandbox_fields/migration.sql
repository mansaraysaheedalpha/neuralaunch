/*
  Warnings:

  - A unique constraint covering the columns `[sandboxContainerId]` on the table `LandingPage` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "LandingPage" ADD COLUMN     "sandboxContainerId" TEXT,
ADD COLUMN     "sandboxInternalIp" TEXT;

-- CreateTable
CREATE TABLE "CofounderMessage" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT NOT NULL,

    CONSTRAINT "CofounderMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CofounderMessage_conversationId_idx" ON "CofounderMessage"("conversationId");

-- CreateIndex
CREATE INDEX "CofounderMessage_createdAt_idx" ON "CofounderMessage"("createdAt");

-- CreateIndex
CREATE INDEX "EmailSignup_email_idx" ON "EmailSignup"("email");

-- CreateIndex
CREATE INDEX "EmailSignup_createdAt_idx" ON "EmailSignup"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPage_sandboxContainerId_key" ON "LandingPage"("sandboxContainerId");

-- CreateIndex
CREATE INDEX "LandingPage_isPublished_idx" ON "LandingPage"("isPublished");

-- CreateIndex
CREATE INDEX "LandingPage_createdAt_idx" ON "LandingPage"("createdAt");

-- CreateIndex
CREATE INDEX "PageView_sessionId_idx" ON "PageView"("sessionId");

-- CreateIndex
CREATE INDEX "PageView_createdAt_idx" ON "PageView"("createdAt");

-- CreateIndex
CREATE INDEX "PageView_utmSource_idx" ON "PageView"("utmSource");

-- AddForeignKey
ALTER TABLE "CofounderMessage" ADD CONSTRAINT "CofounderMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
