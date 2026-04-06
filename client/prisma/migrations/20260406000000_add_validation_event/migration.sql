-- CreateTable
CREATE TABLE "ValidationEvent" (
    "id" TEXT NOT NULL,
    "validationPageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "visitorId" TEXT,
    "properties" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ValidationEvent_validationPageId_eventType_idx" ON "ValidationEvent"("validationPageId", "eventType");

-- CreateIndex
CREATE INDEX "ValidationEvent_validationPageId_createdAt_idx" ON "ValidationEvent"("validationPageId", "createdAt");

-- AddForeignKey
ALTER TABLE "ValidationEvent" ADD CONSTRAINT "ValidationEvent_validationPageId_fkey" FOREIGN KEY ("validationPageId") REFERENCES "ValidationPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
