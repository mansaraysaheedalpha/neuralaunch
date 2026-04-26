-- TransformationReport — once-per-venture personal narrative report
-- generated when the founder Marks Complete. Reads everything across
-- the venture's cycles (belief states, recommendations, check-ins,
-- tool sessions, CycleSummaries, FounderProfile, validation signals)
-- and produces a non-template narrative. The row holds three
-- concerns: job-progress (stage / errorMessage), result data
-- (content / redactionCandidates), and publish state (publishState
-- / publicSlug / publishedAt) — split fields keep the lifecycles
-- independent.

CREATE TABLE IF NOT EXISTS "TransformationReport" (
  "id"                  TEXT         PRIMARY KEY,
  "ventureId"           TEXT         NOT NULL,
  "userId"              TEXT         NOT NULL,
  "stage"               TEXT         NOT NULL DEFAULT 'queued',
  "errorMessage"        TEXT,
  "startedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  "completedAt"         TIMESTAMP(3),
  "content"             JSONB,
  "redactionCandidates" JSONB,
  "redactionEdits"      JSONB        NOT NULL DEFAULT '{}',
  "publishState"        TEXT         NOT NULL DEFAULT 'private',
  "publicSlug"          TEXT,
  "publishedAt"         TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransformationReport_ventureId_fkey"
    FOREIGN KEY ("ventureId") REFERENCES "Venture"("id") ON DELETE CASCADE,
  CONSTRAINT "TransformationReport_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- One report per venture — also the natural lookup key when the
-- viewer page renders or the Inngest worker upserts.
CREATE UNIQUE INDEX IF NOT EXISTS "TransformationReport_ventureId_key"
  ON "TransformationReport"("ventureId");

-- Slug lookup for the future /stories/[slug] public viewer. Unique
-- so the slug can be safely shared in URLs.
CREATE UNIQUE INDEX IF NOT EXISTS "TransformationReport_publicSlug_key"
  ON "TransformationReport"("publicSlug");

-- "List my reports" + "list my published reports" queries. The
-- composite covers both the userId-scoped browse and the
-- publishState filter without a second index.
CREATE INDEX IF NOT EXISTS "TransformationReport_userId_idx"
  ON "TransformationReport"("userId");

CREATE INDEX IF NOT EXISTS "TransformationReport_userId_publishState_idx"
  ON "TransformationReport"("userId", "publishState");
