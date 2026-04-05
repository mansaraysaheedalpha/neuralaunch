-- Persist interview flags to DB so sessions survive Redis eviction.
-- askedFields, pricingProbed, psychConstraintProbed are checkpointed on every
-- turn and restored if Redis is cold. lastTurnAt drives incomplete-session detection.

ALTER TABLE "DiscoverySession"
  ADD COLUMN "askedFields"           JSONB    NOT NULL DEFAULT '[]',
  ADD COLUMN "pricingProbed"         BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN "psychConstraintProbed" BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN "lastTurnAt"            TIMESTAMP(3);

CREATE INDEX "DiscoverySession_userId_status_lastTurnAt_idx"
  ON "DiscoverySession"("userId", "status", "lastTurnAt");
