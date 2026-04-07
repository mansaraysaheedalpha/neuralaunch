-- CreateTable
CREATE TABLE "RoadmapProgress" (
    "id"               TEXT         NOT NULL,
    "roadmapId"        TEXT         NOT NULL,
    "totalTasks"       INTEGER      NOT NULL,
    "completedTasks"   INTEGER      NOT NULL DEFAULT 0,
    "blockedTasks"     INTEGER      NOT NULL DEFAULT 0,
    "lastActivityAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPhase"     INTEGER      NOT NULL DEFAULT 1,
    "nudgePending"     BOOLEAN      NOT NULL DEFAULT false,
    "nudgeLastSentAt"  TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapProgress_roadmapId_key" ON "RoadmapProgress"("roadmapId");
CREATE INDEX "RoadmapProgress_nudgePending_idx" ON "RoadmapProgress"("nudgePending");
CREATE INDEX "RoadmapProgress_lastActivityAt_idx" ON "RoadmapProgress"("lastActivityAt");

-- AddForeignKey
ALTER TABLE "RoadmapProgress"
    ADD CONSTRAINT "RoadmapProgress_roadmapId_fkey"
    FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
