-- Stage 7.2 scalability indexes.
--
-- The Conversation sidebar query uses (userId, createdAt desc) as
-- its hot predicate. The transcript loader uses (conversationId,
-- createdAt asc). Both queries were doing full table scans filtered
-- by the leading column with no index support — fine at small N,
-- catastrophic as user count and message volume grow.
--
-- These are pure additive indexes — no data migration, no downtime.

-- Conversation sidebar query: where userId = $1 order by createdAt desc limit 100
CREATE INDEX IF NOT EXISTS "Conversation_userId_createdAt_idx"
  ON "Conversation" ("userId", "createdAt");

-- Message transcript query: where conversationId = $1 order by createdAt asc
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx"
  ON "Message" ("conversationId", "createdAt");
