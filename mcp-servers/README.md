# NeuraLaunch MCP Servers

Model Context Protocol (MCP) servers for NeuraLaunch AI agents. These servers provide browser automation and advanced AI capabilities to your agents in production.

## 📦 What's Included

### 1. Playwright MCP Server
- **Port**: 3100
- **Capabilities**: Browser automation, screenshots, web scraping, deployment verification
- **Dependencies**: Playwright, Chromium

### 2. Claude Skills MCP Server
- **Port**: 3101
- **Capabilities**: Extended thinking, code generation, architecture design, debugging
- **Dependencies**: Anthropic SDK
- **Requires**: `ANTHROPIC_API_KEY`

## 🚀 Quick Deployment to Railway

### Prerequisites
- Railway account (sign up at https://railway.app)
- Railway CLI installed: `npm install -g @railway/cli`
- Anthropic API key (for Claude Skills server)

### Step 1: Deploy Playwright Server

```bash
# Navigate to playwright server
cd playwright-server

# Login to Railway
railway login

# Create new project
railway init

# Deploy
railway up

# Get the deployment URL
railway domain
```

Railway will provide a URL like: `https://playwright-production-xxx.up.railway.app`

### Step 2: Deploy Claude Skills Server

```bash
# Navigate to claude-skills server
cd ../claude-skills-server

# Create new Railway project
railway init

# Set environment variable
railway variables set ANTHROPIC_API_KEY=sk-ant-your-key-here

# Deploy
railway up

# Get the deployment URL
railway domain
```

Railway will provide a URL like: `https://claude-skills-production-xxx.up.railway.app`

### Step 3: Update Vercel Environment Variables

Go to your Vercel project settings and add/update these environment variables:

```bash
MCP_PLAYWRIGHT_URL=https://playwright-production-xxx.up.railway.app/mcp
MCP_CLAUDE_SKILLS_URL=https://claude-skills-production-xxx.up.railway.app/mcp
```

Then redeploy your main app on Vercel.

## 🐳 Alternative: Docker Deployment

### Build and Run Locally

#### Playwright Server
```bash
cd playwright-server
docker build -t neuralaunch-playwright-mcp .
docker run -p 3100:3100 neuralaunch-playwright-mcp
```

#### Claude Skills Server
```bash
cd claude-skills-server
docker build -t neuralaunch-claude-skills-mcp .
docker run -p 3101:3101 -e ANTHROPIC_API_KEY=your-key neuralaunch-claude-skills-mcp
```

### Deploy to Docker Hub
```bash
# Build
docker build -t your-username/neuralaunch-playwright-mcp ./playwright-server
docker build -t your-username/neuralaunch-claude-skills-mcp ./claude-skills-server

# Push
docker push your-username/neuralaunch-playwright-mcp
docker push your-username/neuralaunch-claude-skills-mcp
```

## 🌐 Alternative: Render Deployment

### Playwright Server

1. Go to https://render.com
2. Create new **Web Service**
3. Connect your GitHub repository
4. Settings:
   - **Name**: `neuralaunch-playwright-mcp`
   - **Root Directory**: `mcp-servers/playwright-server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free tier is fine for testing

### Claude Skills Server

1. Create another Web Service
2. Settings:
   - **Name**: `neuralaunch-claude-skills-mcp`
   - **Root Directory**: `mcp-servers/claude-skills-server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment Variables**:
     - `ANTHROPIC_API_KEY`: your API key

## 🧪 Testing Your Deployment

### Test Playwright Server
```bash
# Health check
curl https://your-playwright-url/health

# Test screenshot
curl -X POST https://your-playwright-url/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "screenshot",
    "arguments": {
      "url": "https://example.com",
      "fullPage": true
    }
  }'
```

### Test Claude Skills Server
```bash
# Health check
curl https://your-claude-skills-url/health

# List skills
curl https://your-claude-skills-url/skills

# Test a skill
curl -X POST https://your-claude-skills-url/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "code_generation",
    "arguments": {
      "prompt": "Write a function to validate email addresses",
      "thinkingBudget": 5000
    }
  }'
```

## 📊 Monitoring

### Check Server Status

Both servers expose a `/health` endpoint:

```bash
# Playwright
curl https://your-playwright-url/health

# Claude Skills
curl https://your-claude-skills-url/health
```

### Railway Monitoring

Railway provides built-in monitoring:
- Go to your project dashboard
- View logs, metrics, and deployments
- Set up alerts for downtime

## 🔧 Configuration

### Environment Variables

#### Playwright Server
- `PORT` (default: 3100)
- `NODE_ENV` (production/development)

#### Claude Skills Server
- `PORT` (default: 3101)
- `NODE_ENV` (production/development)
- `ANTHROPIC_API_KEY` (required)

## 🚨 Troubleshooting

### Playwright Server Issues

**Problem**: Chromium fails to launch
**Solution**: Ensure Docker image has all Playwright dependencies (already included in Dockerfile)

**Problem**: Timeouts on slow sites
**Solution**: Increase timeout in the request arguments

### Claude Skills Server Issues

**Problem**: "ANTHROPIC_API_KEY not set"
**Solution**: Set the environment variable in Railway/Render dashboard

**Problem**: Rate limit errors
**Solution**: Check your Anthropic API usage limits

## 💰 Cost Estimates

### Railway (Recommended)
- **Playwright Server**: ~$5-10/month (Hobby plan)
- **Claude Skills Server**: ~$5/month (Hobby plan)
- **Total**: ~$10-15/month

### Render
- **Both Servers**: Free tier available (with limitations)
- **Paid**: $7/month per service

### API Costs
- **Anthropic Claude API**: Pay-per-use
  - ~$0.003 per 1K input tokens
  - ~$0.015 per 1K output tokens

## 📚 API Documentation

### Playwright Server

#### Screenshot
```json
{
  "tool": "screenshot",
  "arguments": {
    "url": "https://example.com",
    "fullPage": true,
    "browser": "chromium"
  }
}
```

#### Navigate
```json
{
  "tool": "navigate",
  "arguments": {
    "url": "https://example.com",
    "waitFor": "#main-content"
  }
}
```

#### Verify Deployment
```json
{
  "tool": "verify_deployment",
  "arguments": {
    "url": "https://your-app.com",
    "expectedTitle": "My App",
    "expectedText": "Welcome"
  }
}
```

### Claude Skills Server

Available skills:
- `extended_thinking`
- `code_generation`
- `code_review`
- `architecture_design`
- `problem_solving`
- `refactoring`
- `test_generation`
- `documentation`
- `debugging`
- `security_review`

Example request:
```json
{
  "tool": "code_generation",
  "arguments": {
    "prompt": "Create a REST API endpoint for user authentication",
    "thinkingBudget": 8000,
    "includeReasoning": true,
    "context": {
      "techStack": ["Node.js", "Express", "JWT"]
    }
  }
}
```

## 🔒 Security

- Both servers use helmet.js for security headers
- CORS is configured to accept requests from any origin (configure as needed)
- No authentication is implemented by default (add if needed)
- Playwright runs in headless mode
- Consider adding rate limiting for production

## 📝 License

MIT

## 🆘 Support

For issues with:
- **NeuraLaunch**: Open an issue in the main repository
- **Railway**: https://railway.app/help
- **Render**: https://render.com/docs
- **Playwright**: https://playwright.dev/docs/intro
- **Anthropic Claude**: https://docs.anthropic.com

## 🎯 Next Steps

1. Deploy both servers to Railway
2. Update Vercel environment variables with the deployment URLs
3. Test the `/health` endpoints
4. Redeploy your main NeuraLaunch app
5. Monitor the MCP health via `/api/mcp/health` on your main app

Your agents will now have access to browser automation and advanced AI capabilities in production! 🚀
