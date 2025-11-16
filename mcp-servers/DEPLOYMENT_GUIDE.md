# 🚀 MCP Servers Deployment Guide

Complete step-by-step guide to deploy your NeuraLaunch MCP servers to Railway.

## Prerequisites

Before you begin, make sure you have:

✅ Railway account (free): https://railway.app
✅ Anthropic API key: https://console.anthropic.com
✅ Railway CLI installed globally

## Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
```

Verify installation:
```bash
railway --version
```

## Step 2: Login to Railway

```bash
railway login
```

This will open your browser to authenticate.

## Step 3: Deploy Playwright MCP Server

```bash
# Navigate to the playwright server directory
cd C:\Users\User\Desktop\neuralaunch\mcp-servers\playwright-server

# Initialize Railway project
railway init

# When prompted:
# - Project name: neuralaunch-playwright-mcp (or your choice)
# - Select: Create new project

# Deploy to Railway
railway up

# Wait for deployment to complete (2-3 minutes)

# Generate public URL
railway domain

# Copy the URL - it will look like:
# https://neuralaunch-playwright-mcp-production.up.railway.app
```

**Save this URL!** You'll need it for Vercel.

Example: `https://neuralaunch-playwright-mcp-production.up.railway.app`

## Step 4: Deploy Claude Skills MCP Server

```bash
# Navigate to the claude-skills server directory
cd ../claude-skills-server

# Initialize Railway project
railway init

# When prompted:
# - Project name: neuralaunch-claude-skills-mcp
# - Select: Create new project

# Set your Anthropic API key
railway variables set ANTHROPIC_API_KEY=sk-ant-your-actual-key-here

# Deploy to Railway
railway up

# Wait for deployment to complete (1-2 minutes)

# Generate public URL
railway domain

# Copy the URL - it will look like:
# https://neuralaunch-claude-skills-mcp-production.up.railway.app
```

**Save this URL!** You'll need it for Vercel.

Example: `https://neuralaunch-claude-skills-mcp-production.up.railway.app`

## Step 5: Test Your Deployments

### Test Playwright Server

Open in browser or use curl:

```bash
# Health check
curl https://your-playwright-url.up.railway.app/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2025-01-16T...",
#   "browsers": {
#     "chromium": "available",
#     "firefox": "available",
#     "webkit": "available"
#   }
# }
```

### Test Claude Skills Server

```bash
# Health check
curl https://your-claude-skills-url.up.railway.app/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2025-01-16T...",
#   "anthropic": {
#     "configured": true,
#     "model": "claude-sonnet-4-5-20250929"
#   },
#   "skills": ["extended_thinking", "code_generation", ...]
# }
```

## Step 6: Update Vercel Environment Variables

1. Go to your Vercel dashboard: https://vercel.com
2. Select your NeuraLaunch project
3. Go to **Settings** → **Environment Variables**
4. Add/update these variables:

```bash
# Add these new variables:
MCP_PLAYWRIGHT_URL=https://your-playwright-url.up.railway.app/mcp
MCP_CLAUDE_SKILLS_URL=https://your-claude-skills-url.up.railway.app/mcp

# Make sure these are already set (from before):
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=https://your-app.vercel.app
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
PUSHER_APP_ID=...
PUSHER_SECRET=...
NEXT_PUBLIC_PUSHER_KEY=...
NEXT_PUBLIC_PUSHER_CLUSTER=...

# Optional but recommended:
GITHUB_MCP_TOKEN=ghp_...
BRAVE_SEARCH_API_KEY=BSA...
```

5. Save all variables
6. Redeploy your Vercel app:
   - Go to **Deployments** tab
   - Click the **three dots** on the latest deployment
   - Click **Redeploy**

## Step 7: Verify Everything Works

After Vercel redeploys (2-3 minutes):

1. Visit your app: `https://your-app.vercel.app`

2. Check MCP health endpoint:
```bash
curl https://your-app.vercel.app/api/mcp/health
```

Expected response:
```json
{
  "status": "healthy",
  "servers": {
    "connected": ["github", "brave-search", "filesystem", "playwright", "claude-skills"],
    "disconnected": [],
    "missingAuth": []
  },
  "tools": {
    "total": 15
  }
}
```

3. If you see `"connected": [..., "playwright", "claude-skills"]` - **SUCCESS!** 🎉

## 🎯 Quick Reference

### Your Deployment URLs

Fill these in after deployment:

```
Playwright MCP Server:
https://_____________________________________.up.railway.app

Claude Skills MCP Server:
https://_____________________________________.up.railway.app

Main NeuraLaunch App:
https://_____________________________________.vercel.app
```

### Vercel Environment Variables

```bash
MCP_PLAYWRIGHT_URL=https://YOUR_PLAYWRIGHT_URL.up.railway.app/mcp
MCP_CLAUDE_SKILLS_URL=https://YOUR_CLAUDE_SKILLS_URL.up.railway.app/mcp
```

## 🔧 Troubleshooting

### Issue: Playwright server not healthy

**Check Railway logs:**
```bash
cd playwright-server
railway logs
```

**Common fixes:**
- Wait 2-3 minutes for Chromium to install
- Check Railway dashboard for build errors

### Issue: Claude Skills server returns 500

**Check if API key is set:**
```bash
cd claude-skills-server
railway variables
```

**Fix:**
```bash
railway variables set ANTHROPIC_API_KEY=sk-ant-your-key
```

### Issue: Vercel app can't connect to MCP servers

**Check URLs are correct:**
- Must end with `/mcp`
- Must use `https://`
- No trailing slash

**Example (correct):**
```
https://neuralaunch-playwright-mcp-production.up.railway.app/mcp
```

**Example (wrong):**
```
https://neuralaunch-playwright-mcp-production.up.railway.app/
https://neuralaunch-playwright-mcp-production.up.railway.app
http://neuralaunch-playwright-mcp-production.up.railway.app/mcp
```

### Issue: Railway CLI not found

**Install it:**
```bash
npm install -g @railway/cli
```

**Still not working? Use full path:**
```bash
npx @railway/cli login
npx @railway/cli init
npx @railway/cli up
```

## 💰 Railway Costs

- **Free tier**: $5 credit/month (enough for testing)
- **Hobby plan**: $5/month per project
- **Estimated cost**: $10-15/month for both servers

You can monitor usage in Railway dashboard: https://railway.app/account/usage

## 🎉 Success Checklist

- [ ] Railway CLI installed
- [ ] Playwright server deployed to Railway
- [ ] Claude Skills server deployed to Railway
- [ ] Both servers returning 200 on `/health`
- [ ] Vercel environment variables updated
- [ ] Main app redeployed on Vercel
- [ ] `/api/mcp/health` shows both servers connected
- [ ] Tested creating a new project in your app

## 📝 Next Steps

After successful deployment:

1. **Monitor your servers** - Check Railway dashboard regularly
2. **Set up alerts** - Railway can email you on failures
3. **Scale if needed** - Railway auto-scales based on traffic
4. **Update API keys** - Rotate Anthropic API key monthly
5. **Check costs** - Monitor Railway usage to avoid surprises

## 🆘 Need Help?

- **Railway Issues**: https://railway.app/help
- **Deployment Errors**: Check Railway logs with `railway logs`
- **Vercel Issues**: https://vercel.com/help
- **MCP Server Issues**: Check the main README.md

---

**You're all set!** Your NeuraLaunch agents now have full browser automation and advanced AI capabilities in production! 🚀

Test by creating a new project and watch your agents use the MCP servers to build your app.
