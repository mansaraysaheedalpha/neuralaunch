-- Add researchLog JSONB column to Recommendation.
-- Stores every research query, answer, and source list for audit
-- and training data extraction. Default empty array.

ALTER TABLE "Recommendation"
  ADD COLUMN IF NOT EXISTS "researchLog" JSONB NOT NULL DEFAULT '[]';

-- Note: motivationAnchor is stored inside the beliefState JSONB
-- column on DiscoverySession, not as a separate column. The Zod
-- schema handles backward compatibility via .default(). No SQL
-- migration needed for that field.
