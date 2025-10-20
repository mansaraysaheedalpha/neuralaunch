-- CreateTable
CREATE TABLE "ValidationHub" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "customerInterviewCount" INTEGER NOT NULL DEFAULT 0,
    "interviewNotes" TEXT,
    "feedbackSentimentScore" DOUBLE PRECISION,
    "marketDemandScore" DOUBLE PRECISION,
    "problemValidationScore" DOUBLE PRECISION,
    "executionScore" DOUBLE PRECISION,
    "totalValidationScore" DOUBLE PRECISION,
    "aiInsight" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValidationHub_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ValidationHub_conversationId_key" ON "ValidationHub"("conversationId");

-- AddForeignKey
ALTER TABLE "ValidationHub" ADD CONSTRAINT "ValidationHub_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
