CREATE TABLE "ToolJobProgressEvent" (
    "id" TEXT NOT NULL,
    "toolJobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolJobProgressEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ToolJobProgressEvent_toolJobId_occurredAt_idx"
ON "ToolJobProgressEvent"("toolJobId", "occurredAt");

ALTER TABLE "ToolJobProgressEvent"
ADD CONSTRAINT "ToolJobProgressEvent_toolJobId_fkey"
FOREIGN KEY ("toolJobId") REFERENCES "ToolJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
