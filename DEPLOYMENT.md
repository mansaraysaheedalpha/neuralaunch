# NeuraLaunch - Production Deployment Guide

## Overview
This guide provides comprehensive instructions for deploying NeuraLaunch to production.

## Prerequisites

### Required Services
1. **Database**: PostgreSQL 14+ with pgvector extension
2. **Authentication**: Google OAuth credentials
3. **AI Services**: 
   - Google Gemini API key
   - OpenAI API key
   - Anthropic Claude API key
4. **Email**: Resend API key
5. **Hosting**: Vercel (recommended) or any Node.js hosting platform

### Development Tools
- Node.js 18+ or 20+
- npm or pnpm
- Git

## Environment Variables

### Required Variables
Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/dbname?schema=public"

# Authentication
NEXTAUTH_URL="https://yourdomain.com"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# AI Services
GOOGLE_API_KEY="your-google-gemini-api-key"
OPENAI_API_KEY="your-openai-api-key"
ANTHROPIC_API_KEY="your-anthropic-claude-api-key"

# Email
RESEND_API_KEY="your-resend-api-key"

# Node Environment
NODE_ENV="production"
```

### Generating NEXTAUTH_SECRET
```bash
openssl rand -base64 32
```

## Database Setup

### 1. PostgreSQL with pgvector

#### Using managed service (recommended)
- Neon, Supabase, or Railway all support pgvector
- Simply enable the pgvector extension in your database

#### Self-hosted PostgreSQL
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Run Migrations
```bash
cd client
npm install
npx prisma generate
npx prisma db push
```

### 3. Verify Database Connection
```bash
npx prisma studio
```

## Building the Application

### 1. Install Dependencies
```bash
cd client
npm install
```

### 2. Build for Production
```bash
npm run build
```

### 3. Test Production Build Locally
```bash
npm start
```

## Deployment Options

### Option 1: Vercel (Recommended)

#### Via Vercel CLI
```bash
npm i -g vercel
vercel login
vercel --prod
```

#### Via GitHub Integration
1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

#### Vercel Configuration
The project includes `vercel.json` with optimal settings.

### Option 2: Docker

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY client/package*.json ./
RUN npm ci
COPY client ./
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
```

Build and run:
```bash
docker build -t neuralaunch .
docker run -p 3000:3000 --env-file .env neuralaunch
```

### Option 3: Traditional Node.js Hosting

1. Clone repository on server
2. Install dependencies: `npm install`
3. Build application: `npm run build`
4. Start with PM2:
```bash
npm i -g pm2
pm2 start npm --name "neuralaunch" -- start
pm2 save
pm2 startup
```

## Post-Deployment

### 1. Verify Health Check
```bash
curl https://yourdomain.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "checks": {
    "database": {
      "status": "up",
      "latency": 15
    }
  },
  "version": "0.1.0",
  "uptime": 123.45
}
```

### 2. Test Authentication
- Visit your domain
- Click "Login"
- Complete Google OAuth flow

### 3. Monitor Logs
- Check application logs for errors
- Monitor database performance
- Set up error tracking (Sentry recommended)

## Security Checklist

### Before Going Live
- [ ] All environment variables are set
- [ ] NEXTAUTH_SECRET is unique and secure
- [ ] Database is properly secured (not publicly accessible)
- [ ] SSL/TLS is enabled (HTTPS)
- [ ] CORS settings are configured correctly
- [ ] Rate limiting is enabled
- [ ] Error messages don't expose sensitive data
- [ ] Database backups are configured
- [ ] Monitoring and alerting are set up

### Regular Maintenance
- [ ] Keep dependencies updated
- [ ] Monitor security advisories
- [ ] Review access logs
- [ ] Backup database regularly
- [ ] Test disaster recovery procedures

## Performance Optimization

### Database
```sql
-- Create indexes if not already present
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversation_created_at 
  ON "Conversation" (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_signup_email 
  ON "EmailSignup" (email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_page_view_landing_page 
  ON "PageView" (landing_page_id, created_at DESC);
```

### Caching
- Trends API caches data for 12 hours for unauthenticated users
- Consider adding Redis for session storage in high-traffic scenarios

### CDN
- Use Vercel's CDN (automatic) or Cloudflare
- Optimize images with Next.js Image component
- Enable gzip/brotli compression

## Monitoring

### Recommended Tools
1. **Application Monitoring**: Vercel Analytics, New Relic, or Datadog
2. **Error Tracking**: Sentry
3. **Uptime Monitoring**: UptimeRobot or Pingdom
4. **Database Monitoring**: Built-in provider tools

### Custom Monitoring
Monitor these endpoints:
- `/api/health` - Application health
- Error rates in logs
- Response times
- Database query performance

## Troubleshooting

### Common Issues

#### Database Connection Errors
```
Error: Can't reach database server
```
**Solution**: Verify DATABASE_URL and network connectivity

#### Authentication Not Working
```
Error: Invalid OAuth redirect
```
**Solution**: Ensure NEXTAUTH_URL matches your domain and is added to Google OAuth allowed redirects

#### Build Fails
```
Error: Cannot find module
```
**Solution**: Delete node_modules and package-lock.json, then `npm install`

### Getting Help
- Check application logs
- Review `/api/health` endpoint
- Consult Next.js documentation
- Check Prisma logs for database issues

## Scaling

### Horizontal Scaling
- Deploy multiple instances behind a load balancer
- Use external session storage (Redis)
- Implement database connection pooling

### Vertical Scaling
- Increase server resources
- Optimize database queries
- Enable caching layers

## Rollback Procedure

### Vercel
```bash
vercel rollback
```

### Manual Deployment
1. Checkout previous version: `git checkout <commit-hash>`
2. Rebuild: `npm run build`
3. Restart application

## Support

For issues or questions:
1. Check the `/api/health` endpoint
2. Review application logs
3. Consult this documentation
4. Open an issue on GitHub

## Additional Resources
- [Next.js Deployment Docs](https://nextjs.org/docs/deployment)
- [Prisma Production Checklist](https://www.prisma.io/docs/guides/performance-and-optimization/production-checklist)
- [Vercel Documentation](https://vercel.com/docs)
