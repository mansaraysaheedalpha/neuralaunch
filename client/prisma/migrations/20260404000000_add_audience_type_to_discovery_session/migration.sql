-- Add audienceType to DiscoverySession
-- Persisted when detectAudienceType() fires in the turn route (questionCount >= 2).
-- Used by the roadmap engine to apply audience-specific sequencing rules.

ALTER TABLE "DiscoverySession" ADD COLUMN "audienceType" TEXT;
