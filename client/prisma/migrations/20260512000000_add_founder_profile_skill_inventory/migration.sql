-- FounderProfile.skillInventory — Stage 2 (No Idea archetype)
-- structured 14-skill × 4-tier matrix per (founder + each teammate).
--
-- Nullable so existing rows (founders whose journey predates the No
-- Idea archetype) keep working unchanged. The Stage 2 authoring path
-- seeds the column on first turn that captures a skill update.
--
-- Shape validated at the application boundary by SkillInventorySchema
-- in src/lib/ideation/stage2-requirements/schema.ts. Reads go through
-- safeParseSkillInventory; writes go through toJsonValue.
--
-- Separate from profile.stableContext.skills — that column stays as
-- the loose qualitative string array surfaced from belief-state
-- extraction. This column carries the structured matrix used for
-- Constraints derivation in Stage 2.

ALTER TABLE "FounderProfile"
  ADD COLUMN "skillInventory" JSONB;
