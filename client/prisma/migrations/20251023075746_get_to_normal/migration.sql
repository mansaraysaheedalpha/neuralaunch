-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "AiMemory" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiMemory_conversationId_idx" ON "AiMemory"("conversationId");

-- CreateIndex
CREATE INDEX "AiMemory_userId_idx" ON "AiMemory"("userId");

-- AddForeignKey
ALTER TABLE "AiMemory" ADD CONSTRAINT "AiMemory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMemory" ADD CONSTRAINT "AiMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
