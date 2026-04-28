-- Pause-Reason Agent — three nullable columns on Venture capturing
-- the founder's typed reason at active → paused transitions, the
-- mode the agent landed on ('acknowledge' | 'reframe' | 'mirror' |
-- 'static' | 'no_reason'), and the wall-clock pause time. All
-- additive + nullable so legacy rows need no backfill — they
-- continue to render with the existing static motivational copy.
--
-- See docs/pause-reason-agent-plan.md for the full design and the
-- gating logic for when 'mirror' mode is allowed to fire.

ALTER TABLE "Venture" ADD COLUMN     "pauseReason" TEXT,
ADD COLUMN     "pauseReasonMode" TEXT,
ADD COLUMN     "pausedAt" TIMESTAMP(3);
