-- AlterTable
ALTER TABLE "ValidationReport"
  ADD COLUMN "disconfirmedAssumptions" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "pivotOptions"            JSONB NOT NULL DEFAULT '[]';
