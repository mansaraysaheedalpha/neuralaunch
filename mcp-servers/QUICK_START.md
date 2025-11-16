# ⚡ Quick Start - Deploy MCP Servers in 5 Minutes

## Copy-Paste Commands (Windows)

### 1. Install Railway CLI
```bash
npm install -g @railway/cli
```

### 2. Deploy Playwright Server
```bash
cd C:\Users\User\Desktop\neuralaunch\mcp-servers\playwright-server
railway login
railway init
railway up
railway domain
```
**Copy the URL you get from `railway domain`**

### 3. Deploy Claude Skills Server
```bash
cd C:\Users\User\Desktop\neuralaunch\mcp-servers\claude-skills-server
railway init
railway variables set ANTHROPIC_API_KEY=YOUR_ANTHROPIC_KEY_HERE
railway up
railway domain
```
**Copy the URL you get from `railway domain`**

### 4. Update Vercel

Go to Vercel → Your Project → Settings → Environment Variables

Add these two variables:
```
MCP_PLAYWRIGHT_URL=https://[YOUR_PLAYWRIGHT_URL]/mcp
MCP_CLAUDE_SKILLS_URL=https://[YOUR_CLAUDE_SKILLS_URL]/mcp
```

Click "Redeploy" on your latest deployment.

## Done! ✅

Test: Visit `https://your-app.vercel.app/api/mcp/health`

You should see both `playwright` and `claude-skills` in the `connected` array.

---

**Need detailed instructions?** See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

**Having issues?** See [README.md](./README.md) troubleshooting section
