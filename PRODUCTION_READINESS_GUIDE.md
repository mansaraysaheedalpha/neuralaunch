# Production Readiness Implementation Guide

This guide provides step-by-step instructions to fix the critical issues identified in the audit report.

## Critical Fixes (Launch Blockers) - 10 Hours Total

### 1. Environment Validation (2 hours)

**Create `client/src/lib/env.ts`:**

```typescript
import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  
  // Authentication
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters"),
  NEXTAUTH_URL: z.string().url(),
  
  // AI Services
  GOOGLE_API_KEY: z.string().min(1, "GOOGLE_API_KEY is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  
  // Email (optional for now)
  RESEND_API_KEY: z.string().optional(),
  
  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),
  
  // Optional - Monitoring
  SENTRY_DSN: z.string().url().optional(),
});

// Validate environment variables at startup
export const env = envSchema.parse(process.env);

console.log("✅ Environment variables validated successfully");
```

**Import in `client/src/app/layout.tsx` (server component):**

```typescript
import { env } from '@/lib/env'; // This validates on app startup
```

**Create `.env.example`:**

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ideaspark"

# Authentication (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET="your-secret-here-minimum-32-characters"
NEXTAUTH_URL="http://localhost:3000"

# AI Services
GOOGLE_API_KEY="your-google-api-key"
OPENAI_API_KEY="your-openai-api-key"

# Email (optional)
RESEND_API_KEY="re_your_key_here"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Monitoring (optional)
SENTRY_DSN="https://your-sentry-dsn"
```

---

### 2. Rate Limiting (4 hours)

**Install dependencies:**

```bash
cd client
npm install @upstash/ratelimit @upstash/redis
```

**Create `client/src/lib/rate-limit.ts`:**

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Create a new ratelimiter that allows 10 requests per 10 seconds
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  analytics: true,
});

// For expensive AI operations, use stricter limits
const aiRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "60 s"), // 5 requests per minute
  analytics: true,
  prefix: "ai-ratelimit",
});

export async function checkRateLimit(
  identifier: string,
  type: "default" | "ai" = "default"
) {
  const limiter = type === "ai" ? aiRatelimit : ratelimit;
  const { success, limit, reset, remaining } = await limiter.limit(identifier);

  return { success, limit, reset, remaining };
}
```

**Add to `.env.example`:**

```bash
# Upstash Redis (for rate limiting)
UPSTASH_REDIS_REST_URL="your-url"
UPSTASH_REDIS_REST_TOKEN="your-token"
```

**Update API routes (example for `client/src/app/api/chat/route.ts`):**

```typescript
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // CHECK RATE LIMIT
    const { success, reset } = await checkRateLimit(userId, "ai");
    if (!success) {
      return NextResponse.json(
        { 
          error: "Rate limit exceeded. Please try again later.",
          resetAt: new Date(reset).toISOString(),
        },
        { status: 429 }
      );
    }

    // ... rest of the handler
  } catch (error) {
    // ... error handling
  }
}
```

**Apply rate limiting to these routes:**
- `/api/chat` - AI rate limit
- `/api/cofounder` - AI rate limit
- `/api/sprint/assistant` - AI rate limit
- `/api/landing-page/generate` - AI rate limit
- `/api/landing-page/signup` - Default rate limit (prevent spam)

---

### 3. Error Tracking with Sentry (2 hours)

**Install Sentry:**

```bash
npm install @sentry/nextjs
```

**Create `client/sentry.client.config.ts`:**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
});
```

**Create `client/sentry.server.config.ts`:**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
});
```

**Create `client/sentry.edge.config.ts`:**

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
});
```

**Update `client/next.config.ts`:**

```typescript
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {
  // ... existing config
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "your-org",
  project: "ideaspark",
});
```

**Add to API routes for better error tracking:**

```typescript
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    // ... handler logic
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        route: "/api/chat",
        userId: session?.user?.id,
      },
    });
    console.error("[CHAT_POST_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
```

**Add to `.env.example`:**

```bash
# Sentry Error Tracking
SENTRY_DSN="https://your-sentry-dsn"
NEXT_PUBLIC_SENTRY_DSN="https://your-sentry-dsn"
```

---

### 4. Health Check Endpoint (1 hour)

**Create `client/src/app/api/health/route.ts`:**

```typescript
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();
  
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: "checking",
    },
  };

  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = "connected";
  } catch (error) {
    health.status = "error";
    health.checks.database = "disconnected";
    console.error("Health check database error:", error);
    
    return NextResponse.json(health, { status: 503 });
  }

  const duration = Date.now() - startTime;
  
  return NextResponse.json({
    ...health,
    responseTime: `${duration}ms`,
  });
}
```

---

### 5. Security Headers via Middleware (1 hour)

**Create `client/src/middleware.ts`:**

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  
  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  
  // CORS for public endpoints
  const origin = request.headers.get('origin');
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
  ].filter(Boolean);
  
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  
  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/lp/:path*', // Public landing pages
  ],
};
```

---

## High Priority Fixes (Week 1)

### 6. Basic API Tests (20 hours)

**Install test dependencies:**

```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom
```

**Create `client/vitest.config.ts`:**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Create `client/tests/setup.ts`:**

```typescript
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
```

**Create example test `client/tests/api/health.test.ts`:**

```typescript
import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('Health Check API', () => {
  it('should return 200 OK with health status', async () => {
    const response = await GET();
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.checks.database).toBe('connected');
  });
});
```

**Add test script to `package.json`:**

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

---

### 7. Structured Logging (8 hours)

**Install Pino:**

```bash
npm install pino pino-pretty
```

**Create `client/src/lib/logger.ts`:**

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  }),
});

export function createRequestLogger(userId?: string, route?: string) {
  return logger.child({
    userId,
    route,
    requestId: crypto.randomUUID(),
  });
}
```

**Use in API routes:**

```typescript
import { createRequestLogger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const log = createRequestLogger(session?.user?.id, '/api/chat');
  
  try {
    log.info('Processing chat request');
    
    // ... handler logic
    
    log.info({ messageCount: messages.length }, 'Chat completed successfully');
    
  } catch (error) {
    log.error({ error }, 'Chat request failed');
    throw error;
  }
}
```

---

### 8. Delete Operations (8 hours)

**Add DELETE endpoint for conversations:**

**Create `client/src/app/api/conversations/[conversationId]/route.ts`:**

```typescript
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { conversationId } = await params;

    // Verify ownership before deleting
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId, userId: session.user.id },
    });

    if (!conversation) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Delete (cascade will handle related records)
    await prisma.conversation.delete({
      where: { id: conversationId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CONVERSATION_DELETE_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
```

**Similar DELETE endpoints needed for:**
- `/api/landing-page/[pageId]`
- `/api/users/me` (account deletion)

---

## Deployment Checklist

Before deploying to production:

- [ ] All environment variables set in Vercel
- [ ] Upstash Redis configured
- [ ] Sentry project created
- [ ] Database migrations run
- [ ] Health check endpoint verified
- [ ] Rate limiting tested
- [ ] Error tracking verified
- [ ] Security headers checked
- [ ] CORS configuration tested
- [ ] API tests passing

---

## Monitoring Setup

### Vercel Analytics

Already included via `@vercel/analytics`. Verify in Vercel dashboard.

### Uptime Monitoring

Use services like:
- UptimeRobot (free)
- Pingdom
- Better Uptime

Monitor:
- `https://ideaspark.com/` (main site)
- `https://ideaspark.com/api/health` (health check)

### Error Alerts

Configure Sentry alerts for:
- Error rate > 5% per hour
- Any error affecting > 10 users
- API response time > 5 seconds

---

## Post-Launch Monitoring

### Week 1 Metrics:
- [ ] API error rate < 0.1%
- [ ] Average response time < 500ms
- [ ] Rate limit hits (adjust if too strict)
- [ ] Health check uptime > 99.9%
- [ ] Database connection stability

### Week 2-4:
- [ ] Add caching for expensive queries
- [ ] Optimize slow database queries
- [ ] Add pagination to list endpoints
- [ ] Implement background jobs
- [ ] Add more comprehensive tests

---

**End of Implementation Guide**
