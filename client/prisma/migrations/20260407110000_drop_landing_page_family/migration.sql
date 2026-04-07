-- Drop the Phase 2 LandingPage family.
--
-- Schema removed in cleanup commit 4 (chore/codebase-cleanup-and-bulletproofing).
-- Zero runtime references to any of these models. Replaced by the
-- Phase 3 ValidationPage family.
--
-- Order: child tables first (FK constraints), then the parent.

DROP TABLE IF EXISTS "EmailSignup"          CASCADE;
DROP TABLE IF EXISTS "PageView"             CASCADE;
DROP TABLE IF EXISTS "LandingPageFeedback"  CASCADE;
DROP TABLE IF EXISTS "FeatureSmokeTest"     CASCADE;
DROP TABLE IF EXISTS "LandingPage"          CASCADE;
