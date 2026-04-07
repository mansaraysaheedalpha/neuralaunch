-- Drop the UserPreferences table.
--
-- Schema removed in cleanup commit 4. The mcpServers + notifications
-- JSON columns are unused — the MCP server feature was removed in
-- Stage 1 commit 2 along with the mcp-servers/ directory and there is
-- no notification preference UI in the current product.

DROP TABLE IF EXISTS "UserPreferences" CASCADE;
