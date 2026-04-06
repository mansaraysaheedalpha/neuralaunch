-- AlterTable
ALTER TABLE "ValidationSnapshot" ADD COLUMN "market" TEXT;

-- Index on market for efficient future aggregation by market segment
CREATE INDEX "ValidationSnapshot_market_idx" ON "ValidationSnapshot"("market");
