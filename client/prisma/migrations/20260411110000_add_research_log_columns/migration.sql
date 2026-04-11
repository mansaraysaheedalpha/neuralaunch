-- Add researchLog JSONB columns to DiscoverySession and Roadmap.
-- See docs/RESEARCH_TOOL_SPEC.md Step 3 ("Add a researchLog for
-- auditing and training"). The Recommendation table already had
-- researchLog from the synthesis-pipeline migration in
-- 20260410120000_add_research_log_and_terminated_status — this
-- migration extends the same shape to the two other surfaces that
-- need their own audit trails:
--
--   DiscoverySession.researchLog — interview-time research
--                                  triggered by founder mentions
--                                  of competitors / regulations /
--                                  market claims / tool references
--
--   Roadmap.researchLog          — check-in-time research (mid-task
--                                  unblock help) and continuation-
--                                  time research (brief generation
--                                  for the next-cycle fork picker)
--
-- Both columns default to an empty array so existing rows remain
-- queryable without backfill, and both share the canonical
-- ResearchLogEntry shape from src/lib/research/types.ts. The
-- safeParseResearchLog helper handles drift defensively.

ALTER TABLE "DiscoverySession"
  ADD COLUMN IF NOT EXISTS "researchLog" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "Roadmap"
  ADD COLUMN IF NOT EXISTS "researchLog" JSONB NOT NULL DEFAULT '[]';
