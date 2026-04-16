-- AlterTable
ALTER TABLE "User" ADD COLUMN "aggregateAnalyticsConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "aggregateAnalyticsConsentAt" TIMESTAMP(3);
