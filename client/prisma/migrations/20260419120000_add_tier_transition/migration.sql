-- CreateTable
CREATE TABLE "TierTransition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromTier" TEXT,
    "toTier" TEXT NOT NULL,
    "paddleEventType" TEXT,
    "paddleEventId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TierTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TierTransition_userId_occurredAt_idx" ON "TierTransition"("userId", "occurredAt");

-- AddForeignKey
ALTER TABLE "TierTransition" ADD CONSTRAINT "TierTransition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
