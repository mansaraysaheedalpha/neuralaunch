-- AlterTable
ALTER TABLE "Venture" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Venture_userId_archivedAt_idx" ON "Venture"("userId", "archivedAt");
