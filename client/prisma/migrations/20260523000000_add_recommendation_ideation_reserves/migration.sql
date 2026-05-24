-- Recommendation.ideationReserveOpportunities — Stage 5 (No Idea archetype)
-- handoff. Snapshot of the 4 reserve opportunities Stage 4 ranked but
-- did not advance to Stage 5. Read by the continuation brief Inngest
-- function: when downstream validation fails for a No Idea recommendation,
-- the brief surfaces these reserves as forks the founder can pivot to.
--
-- Nullable. Legacy (non-No-Idea) recommendations have NULL here; the
-- continuation brief treats NULL as "no reserves to surface" and falls
-- through to the existing fork-generation path.
--
-- Shape validated at the application boundary by ReserveOpportunitySchema
-- in src/lib/ideation/stage5-handoff/schema.ts (bounded array of up to 4
-- denormalised Stage 4 OpportunityEvaluation snapshots).

ALTER TABLE "Recommendation"
  ADD COLUMN "ideationReserveOpportunities" JSONB;
