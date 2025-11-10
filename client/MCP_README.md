# MCP Server Integration

This directory contains the configuration and utilities for Model Context Protocol (MCP) integration in NeuraLaunch.

## Quick Start

1. **Copy environment example**:
   ```bash
   cp .env.mcp.example .env
   ```

2. **Add your API keys** to `.env`:
   - `GITHUB_MCP_TOKEN` - GitHub personal access token
   - `BRAVE_SEARCH_API_KEY` - Brave Search API key
   - Other optional keys (Slack, Notion, etc.)

3. **Review MCP configuration**:
   ```bash
   cat mcp-servers.config.json
   ```

4. **Enable/disable servers** in `mcp-servers.config.json` by setting `"enabled": true/false`

5. **Start the application**:
   ```bash
   npm run dev
   ```

6. **Check MCP health**:
   ```bash
   curl http://localhost:3000/api/mcp/health
   ```

## Files

- **`mcp-servers.config.json`** - MCP server configuration (which servers are enabled, URLs, capabilities)
- **`.env.mcp.example`** - Example environment variables file (copy to `.env`)
- **`src/lib/mcp-config-loader.ts`** - Utility functions for loading and validating MCP config
- **`src/lib/agents/tools/mcp/mcp-tool-adapter.ts`** - MCP tool adapter for integrating with agents
- **`src/app/api/mcp/health/route.ts`** - Health check endpoint
- **`src/app/api/mcp/servers/route.ts`** - MCP server management API

## Available MCP Servers

| Server | Status | Description | Required API Key |
|--------|--------|-------------|------------------|
| GitHub | ✅ Enabled | Repository management, PR, code review | `GITHUB_MCP_TOKEN` |
| Brave Search | ✅ Enabled | Web research, documentation lookup | `BRAVE_SEARCH_API_KEY` |
| Filesystem | ✅ Enabled | Local file operations | None |
| PostgreSQL | ❌ Disabled | Database operations | `DATABASE_URL` |
| Slack | ❌ Disabled | Team notifications | `SLACK_BOT_TOKEN` |
| Notion | ❌ Disabled | Documentation sync | `NOTION_API_KEY` |

## Configuration

### Enable/Disable Servers

Edit `mcp-servers.config.json`:

```json
{
  "name": "github",
  "enabled": true,  // Change to false to disable
  ...
}
```

### Agent-to-MCP Mapping

Each agent automatically uses the MCP servers it needs:

- **Backend Agent** → GitHub, Brave, Filesystem, PostgreSQL
- **Frontend Agent** → GitHub, Brave, Filesystem
- **Documentation Agent** → GitHub, Brave, Filesystem, Notion
- **Deployment Agent** → GitHub, Filesystem, Slack
- And more... (see `mcp-servers.config.json` for full mapping)

## API Endpoints

### Health Check

```bash
GET /api/mcp/health
```

Returns health status of all MCP servers.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-10T23:23:52.559Z",
  "servers": [
    {
      "name": "github",
      "status": "connected",
      "enabled": true,
      "capabilities": ["repository_management", "code_review"]
    }
  ],
  "summary": {
    "total": 3,
    "connected": 2,
    "disconnected": 1,
    "noAuth": 0
  }
}
```

### List Connected Servers

```bash
GET /api/mcp/servers
```

Returns list of currently connected MCP servers and their tools.

### Connect to Server (Admin)

```bash
POST /api/mcp/servers
Content-Type: application/json

{
  "serverUrl": "https://api.example.com/mcp"
}
```

## Environment Variables

### Required (for enabled servers)

```bash
# GitHub (REQUIRED)
GITHUB_MCP_TOKEN=ghp_xxx...

# Brave Search (RECOMMENDED)
BRAVE_SEARCH_API_KEY=BSA_xxx...
```

### Optional

```bash
# Slack Notifications
SLACK_BOT_TOKEN=xoxb-xxx...

# Notion Documentation
NOTION_API_KEY=secret_xxx...

# Database (uses existing DATABASE_URL)
DATABASE_URL=postgresql://...
```

### Configuration Overrides

```bash
# Timeouts and retries
MCP_TIMEOUT=30000
MCP_RETRIES=3
MCP_RETRY_DELAY=1000

# Logging
MCP_LOG_LEVEL=info
```

## Obtaining API Keys

### GitHub Token

1. Visit https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scopes: `repo`, `workflow`, `read:org`
4. Copy token to `GITHUB_MCP_TOKEN`

### Brave Search API

1. Visit https://brave.com/search/api/
2. Sign up for developer account
3. Generate API key
4. Copy key to `BRAVE_SEARCH_API_KEY`

### Slack Bot Token

1. Visit https://api.slack.com/apps
2. Create app or select existing
3. Add bot scopes: `chat:write`, `files:write`
4. Install to workspace
5. Copy Bot User OAuth Token to `SLACK_BOT_TOKEN`

### Notion Integration

1. Visit https://www.notion.so/my-integrations
2. Create new integration
3. Grant access to pages/databases
4. Copy token to `NOTION_API_KEY`

## Security

⚠️ **Important Security Notes:**

- Never commit `.env` file to version control
- Rotate API keys every 90 days
- Use minimum required permissions
- Enable rate limiting in production
- Monitor API usage regularly

See **`/INTEGRATION_GUIDE.md`** for comprehensive security guidelines.

## Troubleshooting

### "MCP Server Not Found"

- Check server is enabled in `mcp-servers.config.json`
- Verify environment variable is set: `echo $GITHUB_MCP_TOKEN`
- Test connectivity: `curl -H "Authorization: Bearer $TOKEN" <server_url>`

### "Rate Limit Exceeded"

- Review rate limits in configuration
- Implement caching for repeated requests
- Upgrade API tier if needed

### "Authentication Failed"

- Verify API key is correct and not expired
- Check key has required permissions
- Regenerate key if necessary

## Documentation

For comprehensive documentation, see:

- **`/INTEGRATION_GUIDE.md`** - Complete integration guide
- **`mcp-servers.config.json`** - Full configuration reference
- **Architecture docs** - `/docs/architecture.md`

## Support

- **Issues**: https://github.com/mansaraysaheedalpha/neuralaunch/issues
- **Discord**: https://discord.gg/neuralaunch
- **Email**: support@neuralaunch.dev

---

**Last Updated**: November 10, 2025  
**Version**: 1.0.0
