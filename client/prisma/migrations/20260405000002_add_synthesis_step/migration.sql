-- Add synthesisStep to DiscoverySession so the Inngest synthesis pipeline
-- can broadcast its current step to the polling client in real time.
ALTER TABLE "DiscoverySession" ADD COLUMN "synthesisStep" TEXT;
