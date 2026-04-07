-- Drop the Tag / TagsOnConversations join table family.
--
-- Schema removed in cleanup commit 4. The only consumer was the
-- legacy /api/trends route which was deleted in Stage 1 commit 1.
--
-- Order: join table first, then the parent Tag table.

DROP TABLE IF EXISTS "TagsOnConversations" CASCADE;
DROP TABLE IF EXISTS "Tag"                 CASCADE;
