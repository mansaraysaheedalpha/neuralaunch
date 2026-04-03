-- Migration: link_discovery_session_to_conversation
-- Adds conversationId to DiscoverySession so interview messages
-- are persisted via the existing Conversation/Message models
-- and appear in the sidebar automatically.

ALTER TABLE "DiscoverySession"
  ADD COLUMN "conversationId" TEXT;

ALTER TABLE "DiscoverySession"
  ADD CONSTRAINT "DiscoverySession_conversationId_key" UNIQUE ("conversationId");

ALTER TABLE "DiscoverySession"
  ADD CONSTRAINT "DiscoverySession_conversationId_fkey"
  FOREIGN KEY ("conversationId")
  REFERENCES "Conversation"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
