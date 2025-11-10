# NeuraLaunch MCP Integration Guide

**Version:** 1.0.0  
**Last Updated:** November 10, 2025  
**Production-Ready:** ✅

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [MCP Server Setup](#mcp-server-setup)
4. [API Keys & Authentication](#api-keys--authentication)
5. [Environment Configuration](#environment-configuration)
6. [Agent-to-MCP Mapping](#agent-to-mcp-mapping)
7. [Security Best Practices](#security-best-practices)
8. [Production Deployment](#production-deployment)
9. [Monitoring & Observability](#monitoring--observability)
10. [Troubleshooting](#troubleshooting)
11. [Advanced Configuration](#advanced-configuration)

---

## Overview

NeuraLaunch uses the **Model Context Protocol (MCP)** to connect AI agents with external tools and services. This integration enables agents to:

- 🔧 Access GitHub repositories for code management
- 🔍 Search the web for documentation and best practices
- 📁 Manage local filesystems for code generation
- 💾 Interact with databases for schema management
- 📢 Send notifications via Slack
- 📝 Sync documentation with Notion

### Key Benefits

- **Extensibility**: Easily add new tools without modifying agent code
- **Security**: Centralized authentication and access control
- **Scalability**: Connection pooling and rate limiting built-in
- **Observability**: Full tracing and monitoring of tool usage

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    NeuraLaunch Platform                     │
├─────────────────────────────────────────────────────────────┤
│  AI Agents                                                  │
│  ├── Backend Agent ──────────┐                              │
│  ├── Frontend Agent ─────────┤                              │
│  ├── Documentation Agent ────┤                              │
│  ├── Deployment Agent ───────┤                              │
│  └── ... (12 specialized agents)                            │
│                               │                              │
│  ┌───────────────────────────▼─────────────────────────┐    │
│  │          MCP Tool Registry & Adapter                 │    │
│  │  - Dynamic tool discovery                            │    │
│  │  - Authentication management                         │    │
│  │  - Rate limiting & retry logic                       │    │
│  └───────────────────────────┬─────────────────────────┘    │
└────────────────────────────────┼──────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
   ┌────▼────┐           ┌──────▼──────┐        ┌───────▼──────┐
   │ GitHub  │           │ Brave Search │        │ Filesystem   │
   │   MCP   │           │     MCP      │        │     MCP      │
   └─────────┘           └──────────────┘        └──────────────┘
        │                        │                        │
   ┌────▼────┐           ┌──────▼──────┐        ┌───────▼──────┐
   │PostgreSQL│          │    Slack    │        │    Notion    │
   │   MCP   │           │     MCP     │        │     MCP      │
   └─────────┘           └─────────────┘        └──────────────┘
```

---

## MCP Server Setup

### Prerequisites

- Node.js 18+ or compatible runtime
- Valid API keys for enabled services
- Network access to MCP server endpoints
- Environment variable management system

### Installation Steps

1. **Review the MCP configuration file**:
   ```bash
   cat client/mcp-servers.config.json
   ```

2. **Enable desired MCP servers** by setting `"enabled": true` in the config

3. **Set up environment variables** (see next section)

4. **Verify connection**:
   ```bash
   npm run test:mcp-connection
   ```

---

## API Keys & Authentication

### Required API Keys

#### 1. GitHub MCP Server (RECOMMENDED)

**Why:** Essential for repository management, code review, and CI/CD integration

**How to obtain:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
   - `read:org` (Read org and team membership)
4. Copy the generated token

**Environment Variable:**
```bash
GITHUB_MCP_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Alternative:** If already using GitHub authentication:
```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Rate Limits:** 5,000 requests/hour (authenticated)

---

#### 2. Brave Search API (RECOMMENDED)

**Why:** Enables web research, documentation lookup, and best practices discovery

**How to obtain:**
1. Visit https://brave.com/search/api/
2. Sign up for a developer account
3. Navigate to API dashboard
4. Generate API key

**Environment Variable:**
```bash
BRAVE_SEARCH_API_KEY=BSA_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Rate Limits:** 
- Free tier: 2,000 queries/month
- Paid tier: Custom limits

**Pricing:**
- Free: $0 (2K queries/month)
- Basic: $5/month (20K queries)
- Pro: $15/month (unlimited)

---

#### 3. PostgreSQL Database (OPTIONAL)

**Why:** Direct database operations for schema management and migrations

**How to obtain:**
1. Use existing `DATABASE_URL` from your Prisma configuration
2. Or create new PostgreSQL connection string

**Environment Variable:**
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/neuralaunch?schema=public
```

**Security Note:** MCP only uses read-only operations by default. Grant minimal permissions.

---

#### 4. Slack Integration (OPTIONAL)

**Why:** Real-time notifications for deployments, errors, and critical events

**How to obtain:**
1. Go to https://api.slack.com/apps
2. Create new app or select existing
3. Navigate to "OAuth & Permissions"
4. Add Bot Token Scopes:
   - `chat:write` (Send messages)
   - `files:write` (Upload files)
   - `channels:read` (View channels)
5. Install app to workspace
6. Copy Bot User OAuth Token

**Environment Variable:**
```bash
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx
```

**Rate Limits:** Tier 2 (20 requests/minute)

---

#### 5. Notion API (OPTIONAL)

**Why:** Sync documentation and maintain knowledge base

**How to obtain:**
1. Visit https://www.notion.so/my-integrations
2. Create new integration
3. Grant access to relevant pages/databases
4. Copy Internal Integration Token

**Environment Variable:**
```bash
NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Rate Limits:** 3 requests/second

---

## Environment Configuration

### Complete .env File Example

Create or update `.env` file in your project root:

```bash
# ================================================================
# NEURALAUNCH MCP SERVER CONFIGURATION
# ================================================================

# ---------------------------
# GitHub Integration (REQUIRED for code management)
# ---------------------------
GITHUB_MCP_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ---------------------------
# Brave Search (RECOMMENDED for research capabilities)
# ---------------------------
BRAVE_SEARCH_API_KEY=BSA_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ---------------------------
# Database (Uses existing Prisma connection)
# ---------------------------
DATABASE_URL=postgresql://user:password@localhost:5432/neuralaunch?schema=public

# ---------------------------
# Slack Notifications (OPTIONAL)
# ---------------------------
# SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx

# ---------------------------
# Notion Documentation (OPTIONAL)
# ---------------------------
# NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ---------------------------
# MCP Server URLs (Use defaults or override)
# ---------------------------
# MCP_GITHUB_URL=https://api.github.com/mcp
# MCP_BRAVE_URL=https://api.search.brave.com/res/v1/web/search
# MCP_POSTGRES_URL=postgres://localhost:5432

# ---------------------------
# MCP Configuration
# ---------------------------
MCP_TIMEOUT=30000
MCP_RETRIES=3
MCP_LOG_LEVEL=info

# ================================================================
# EXISTING NEURALAUNCH CONFIGURATION (Keep these)
# ================================================================

# Next.js
NODE_ENV=production
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-nextauth-secret

# Google AI
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSy...

# OpenAI (if using)
OPENAI_API_KEY=sk-...

# Anthropic (if using)
ANTHROPIC_API_KEY=sk-ant-...

# GitHub OAuth (separate from MCP)
GITHUB_ID=your-github-oauth-id
GITHUB_SECRET=your-github-oauth-secret

# Other services...
```

### Environment Variable Validation

Run the validation script to ensure all required variables are set:

```bash
npm run validate:env
```

---

## Agent-to-MCP Mapping

### Which Agents Use Which MCP Servers

| Agent | GitHub | Brave | Filesystem | PostgreSQL | Slack | Notion |
|-------|--------|-------|------------|-----------|-------|--------|
| **Backend Agent** | ✅ | ✅ | ✅ | ✅ | - | - |
| **Frontend Agent** | ✅ | ✅ | ✅ | - | - | - |
| **Deployment Agent** | ✅ | - | ✅ | - | ✅ | - |
| **Documentation Agent** | ✅ | ✅ | ✅ | - | - | ✅ |
| **Infrastructure Agent** | ✅ | ✅ | ✅ | ✅ | - | - |
| **Planning Agent** | - | ✅ | - | - | - | ✅ |
| **Critic Agent** | ✅ | - | - | - | ✅ | - |
| **Integration Agent** | ✅ | - | ✅ | ✅ | - | - |
| **Monitoring Agent** | - | - | ✅ | - | ✅ | - |
| **Optimization Agent** | ✅ | ✅ | ✅ | - | - | - |
| **Testing Agent** | ✅ | - | ✅ | - | - | - |
| **GitHub Agent** | ✅ | - | ✅ | - | - | - |

### MCP Tool Categories

#### GitHub MCP Tools
- `github_create_repo` - Create new repository
- `github_create_branch` - Create feature branch
- `github_commit_files` - Commit and push files
- `github_create_pr` - Create pull request
- `github_merge_pr` - Merge pull request
- `github_get_file` - Read file contents
- `github_list_branches` - List repository branches

#### Brave Search MCP Tools
- `brave_web_search` - Search the web
- `brave_news_search` - Search recent news
- `brave_documentation_lookup` - Find technical documentation

#### Filesystem MCP Tools
- `fs_read_file` - Read file contents
- `fs_write_file` - Write file contents
- `fs_create_directory` - Create directory
- `fs_list_directory` - List directory contents
- `fs_delete_file` - Delete file
- `fs_move_file` - Move/rename file

#### PostgreSQL MCP Tools (if enabled)
- `postgres_execute_query` - Run SQL query
- `postgres_create_schema` - Create database schema
- `postgres_run_migration` - Execute migration
- `postgres_seed_data` - Insert seed data

---

## Security Best Practices

### 🔒 API Key Management

1. **Never commit API keys to version control**
   - Use `.env` files (ensure `.env` is in `.gitignore`)
   - Use environment variable managers (Vercel, Railway, etc.)

2. **Rotate keys regularly**
   - GitHub tokens: Every 90 days
   - Other API keys: Every 180 days

3. **Use minimum required permissions**
   - GitHub: Only grant necessary scopes
   - Database: Use read-only user when possible
   - Slack: Limit to specific channels

4. **Monitor API usage**
   - Set up alerts for unusual patterns
   - Track rate limit consumption
   - Review access logs monthly

### 🛡️ Production Security Checklist

- [ ] All API keys stored in secure environment variables
- [ ] `.env` file added to `.gitignore`
- [ ] MCP connection timeout configured (30s recommended)
- [ ] Rate limiting enabled on all MCP servers
- [ ] Error messages don't expose sensitive information
- [ ] HTTPS enforced for all MCP connections
- [ ] API keys rotated within last 90 days
- [ ] Access logs enabled and monitored
- [ ] Filesystem MCP restricted to allowed paths only
- [ ] Database MCP using read-only credentials (if applicable)

### 🚨 What to Do If Keys Are Compromised

1. **Immediately revoke** the compromised key
2. **Generate new key** and update environment variables
3. **Review access logs** for unauthorized usage
4. **Notify security team** if enterprise deployment
5. **Update deployment** with new credentials
6. **Monitor** for unusual activity for 48 hours

---

## Production Deployment

### Deployment Checklist

#### Pre-Deployment
- [ ] All MCP servers tested in staging environment
- [ ] Environment variables configured in production
- [ ] API rate limits verified to match production load
- [ ] Monitoring and alerting configured
- [ ] Backup plan established for MCP failures
- [ ] Documentation updated with production URLs

#### Deployment Steps

1. **Set environment variables** in your hosting platform:

   **Vercel:**
   ```bash
   vercel env add GITHUB_MCP_TOKEN production
   vercel env add BRAVE_SEARCH_API_KEY production
   ```

   **Railway:**
   ```bash
   railway variables set GITHUB_MCP_TOKEN=ghp_xxx...
   railway variables set BRAVE_SEARCH_API_KEY=BSA_xxx...
   ```

   **Docker:**
   ```bash
   docker run -e GITHUB_MCP_TOKEN=xxx -e BRAVE_SEARCH_API_KEY=xxx ...
   ```

2. **Deploy application**:
   ```bash
   npm run build
   npm start
   ```

3. **Verify MCP connections**:
   ```bash
   curl https://your-domain.com/api/mcp/health
   ```

4. **Monitor logs** for first 24 hours

#### Post-Deployment
- [ ] Verify all agents can access MCP tools
- [ ] Check rate limit consumption
- [ ] Review error rates in monitoring dashboard
- [ ] Test failover behavior
- [ ] Document any issues encountered

### Platform-Specific Guides

#### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables via dashboard:
# Settings > Environment Variables
```

#### Railway Deployment

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway up
```

#### Docker Deployment

```dockerfile
# Dockerfile example
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["npm", "start"]
```

---

## Monitoring & Observability

### Built-in Monitoring

NeuraLaunch provides comprehensive MCP monitoring:

1. **Connection Health**
   - Endpoint: `GET /api/mcp/health`
   - Returns status of all MCP servers

2. **Tool Usage Metrics**
   - Endpoint: `GET /api/mcp/metrics`
   - Returns usage statistics per tool

3. **Error Rates**
   - Endpoint: `GET /api/mcp/errors`
   - Returns recent error counts

### Sample Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2025-11-10T23:23:52.559Z",
  "servers": [
    {
      "name": "github",
      "status": "connected",
      "responseTime": 45,
      "lastCheck": "2025-11-10T23:23:50.000Z"
    },
    {
      "name": "brave-search",
      "status": "connected",
      "responseTime": 120,
      "lastCheck": "2025-11-10T23:23:50.000Z"
    }
  ]
}
```

### Recommended Monitoring Tools

- **Datadog**: Full APM with MCP tracing
- **New Relic**: Performance monitoring
- **Sentry**: Error tracking
- **Prometheus + Grafana**: Custom metrics

### Setting Up Alerts

Configure alerts for:
- MCP server downtime (> 1 minute)
- Rate limit approaching (> 80%)
- Error rate spike (> 5% in 5 minutes)
- Slow response times (> 5 seconds)

---

## Troubleshooting

### Common Issues

#### Issue: "MCP Server Not Found"

**Symptom:** Agent logs show "Failed to connect to MCP server"

**Solutions:**
1. Check server is enabled in `mcp-servers.config.json`
2. Verify environment variable is set: `echo $GITHUB_MCP_TOKEN`
3. Test connectivity: `curl -H "Authorization: Bearer $GITHUB_MCP_TOKEN" https://api.github.com/user`

#### Issue: "Rate Limit Exceeded"

**Symptom:** 429 Too Many Requests errors in logs

**Solutions:**
1. Review rate limits in configuration
2. Implement exponential backoff
3. Upgrade API tier if necessary
4. Use caching for repeated requests

#### Issue: "Authentication Failed"

**Symptom:** 401 Unauthorized errors

**Solutions:**
1. Verify API key is correct and not expired
2. Check key has required permissions
3. Ensure key is properly formatted in environment
4. Regenerate key if necessary

#### Issue: "Timeout Connecting to MCP"

**Symptom:** Requests timeout after 30 seconds

**Solutions:**
1. Increase timeout in config: `MCP_TIMEOUT=60000`
2. Check network connectivity
3. Verify MCP server URL is correct
4. Test from different network

### Debug Mode

Enable verbose logging:

```bash
MCP_LOG_LEVEL=debug npm start
```

This will log:
- All MCP requests and responses
- Authentication attempts
- Rate limit status
- Connection pool status

### Getting Help

- **GitHub Issues**: https://github.com/mansaraysaheedalpha/neuralaunch/issues
- **Documentation**: https://neuralaunch.dev/docs/mcp
- **Discord Community**: https://discord.gg/neuralaunch

---

## Advanced Configuration

### Custom MCP Server

Add your own MCP server:

```json
{
  "name": "custom-api",
  "enabled": true,
  "description": "Custom API integration",
  "url": "https://api.custom.com/v1",
  "protocol": "http",
  "authentication": {
    "type": "bearer",
    "envVar": "CUSTOM_API_TOKEN"
  },
  "capabilities": ["custom_operation"],
  "agents": ["backend-agent"]
}
```

### Connection Pooling

Optimize connection reuse:

```json
"defaultConfig": {
  "connectionPoolSize": 20,
  "maxIdleTime": 300000,
  "keepAlive": true
}
```

### Retry Strategy

Configure retry behavior:

```json
"retryStrategy": {
  "maxRetries": 3,
  "backoffMultiplier": 2,
  "initialDelay": 1000,
  "maxDelay": 10000
}
```

### Circuit Breaker

Prevent cascading failures:

```json
"circuitBreaker": {
  "enabled": true,
  "failureThreshold": 5,
  "resetTimeout": 60000
}
```

---

## Production Optimization Tips

### Performance

1. **Enable connection pooling** for frequently used MCP servers
2. **Cache responses** for idempotent operations (30-60 seconds)
3. **Use batch operations** where supported (e.g., GitHub bulk commits)
4. **Implement request deduplication** for concurrent identical requests

### Reliability

1. **Set appropriate timeouts** (30s default, 60s for slow operations)
2. **Implement exponential backoff** for retries
3. **Use circuit breakers** to prevent cascade failures
4. **Have fallback strategies** when MCP unavailable

### Cost Optimization

1. **Monitor API usage** to stay within free tiers
2. **Cache frequently accessed data** (documentation, schemas)
3. **Batch operations** to reduce request count
4. **Use webhooks** instead of polling where possible

---

## Summary

✅ **You're Production-Ready When:**

- [ ] All required MCP servers configured with valid API keys
- [ ] Environment variables set in production environment
- [ ] Health checks passing for all enabled servers
- [ ] Monitoring and alerting configured
- [ ] Security best practices implemented
- [ ] Deployment tested in staging environment
- [ ] Team trained on MCP troubleshooting
- [ ] Documentation reviewed and understood

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-10 | Initial production-ready release |

---

**Need Help?** Open an issue or contact the NeuraLaunch team at support@neuralaunch.dev

**License:** MIT | **Maintainer:** NeuraLaunch Team
