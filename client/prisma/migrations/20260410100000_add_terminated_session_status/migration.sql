-- Add TERMINATED value to the DiscoverySessionStatus enum.
-- Used by the safety gate to permanently close sessions where
-- criminal or harmful intent was detected. Once TERMINATED, no
-- further messages are accepted on the session.

ALTER TYPE "DiscoverySessionStatus" ADD VALUE IF NOT EXISTS 'TERMINATED';
