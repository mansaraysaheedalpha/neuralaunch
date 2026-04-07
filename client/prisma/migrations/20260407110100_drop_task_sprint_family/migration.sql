-- Drop the Phase 2 task / sprint / achievement / cofounder family.
--
-- Schema removed in cleanup commit 4. None of these tables have any
-- live code references. The Phase 1 discovery + Phase 2 roadmap
-- engines store their state in DiscoverySession / Roadmap /
-- RoadmapProgress instead.
--
-- Order: child tables first, then parents, then enums.

DROP TABLE IF EXISTS "TaskOutput"        CASCADE;
DROP TABLE IF EXISTS "TaskReminder"      CASCADE;
DROP TABLE IF EXISTS "Task"              CASCADE;
DROP TABLE IF EXISTS "Sprint"            CASCADE;
DROP TABLE IF EXISTS "Achievement"       CASCADE;
DROP TABLE IF EXISTS "ValidationHub"     CASCADE;
DROP TABLE IF EXISTS "CofounderMessage"  CASCADE;
DROP TABLE IF EXISTS "AiMemory"          CASCADE;

DROP TYPE IF EXISTS "TaskStatus";
DROP TYPE IF EXISTS "AssistantType";
