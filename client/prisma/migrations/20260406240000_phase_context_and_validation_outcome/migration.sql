-- Concern 3 — preparatory data for cross-phase coordination.
-- Pure metadata, no behaviour. The future orchestration layer reads
-- these columns instead of needing to retrofit storage.

-- AlterTable: phaseContext on Recommendation + validationOutcome
ALTER TABLE "Recommendation"
  ADD COLUMN "phaseContext"      JSONB,
  ADD COLUMN "validationOutcome" TEXT;

-- AlterTable: phaseContext on Roadmap
ALTER TABLE "Roadmap"
  ADD COLUMN "phaseContext" JSONB;

-- AlterTable: phaseContext on ValidationPage
ALTER TABLE "ValidationPage"
  ADD COLUMN "phaseContext" JSONB;

-- AlterTable: phaseContext on ValidationReport
ALTER TABLE "ValidationReport"
  ADD COLUMN "phaseContext" JSONB;
