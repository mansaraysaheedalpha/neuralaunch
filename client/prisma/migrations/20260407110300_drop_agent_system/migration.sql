-- Drop the entire pre-Phase-3 agent execution system.
--
-- Schema removed in cleanup commit 4. The whole multi-agent wave
-- execution architecture (ProjectContext / AgentTask / ExecutionWave /
-- CriticalFailure / etc.) was replaced by the Phase 3 validation
-- engine. None of these tables have live code references.
--
-- Order: child tables first, then parents.

DROP TABLE IF EXISTS "ExecutionWave"       CASCADE;
DROP TABLE IF EXISTS "ProjectContext"      CASCADE;
DROP TABLE IF EXISTS "AgentTask"           CASCADE;
DROP TABLE IF EXISTS "AgentExecution"      CASCADE;
DROP TABLE IF EXISTS "CriticalFailure"     CASCADE;
DROP TABLE IF EXISTS "AgentMemory"         CASCADE;
DROP TABLE IF EXISTS "MonitoringSnapshot"  CASCADE;
DROP TABLE IF EXISTS "IssueFixAttempt"     CASCADE;
DROP TABLE IF EXISTS "HumanReviewRequest"  CASCADE;
DROP TABLE IF EXISTS "AgentThought"        CASCADE;
DROP TABLE IF EXISTS "Deployment"          CASCADE;
