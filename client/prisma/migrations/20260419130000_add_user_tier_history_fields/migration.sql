-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastPaidTier" TEXT;
ALTER TABLE "User" ADD COLUMN "wasFoundingMember" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "firstSubscribedAt" TIMESTAMP(3);
