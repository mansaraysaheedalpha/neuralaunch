# Timeouts and Caching Guide

This guide explains how to use the timeout and caching utilities to prevent API hangs and reduce costs.

## 🚀 Quick Start

### 1. Using Timeouts

```typescript
import { withTimeout, withAITimeout, fetchWithTimeout, TIMEOUTS } from "@/lib/timeout";

// Basic timeout wrapper
const result = await withTimeout(
  async () => {
    return await someSlowOperation();
  },
  30000, // 30 seconds
  "My slow operation"
);

// AI operation with default AI timeout (2 minutes)
const aiResult = await withAITimeout(
  async () => {
    return await openai.chat.completions.create({...});
  },
  "OpenAI chat completion"
);

// Fetch with timeout
const response = await fetchWithTimeout(
  "https://api.example.com/data",
  { method: "GET" },
  10000 // 10 seconds
);
```

### 2. Using Caching

```typescript
import { getCache, setCache, getCachedOrCompute, CACHE_TTL } from "@/lib/cache";

// Simple get/set
await setCache("my-key", { data: "value" }, CACHE_TTL.DEFAULT);
const cached = await getCache<{ data: string }>("my-key");

// Cache-aside pattern (recommended)
const data = await getCachedOrCompute(
  "expensive-operation-key",
  async () => {
    // This only runs on cache miss
    return await expensiveOperation();
  },
  {
    ttl: CACHE_TTL.AI_ANALYSIS,
    prefix: "analysis",
  }
);
```

### 3. Using AI Utilities (Timeout + Caching Combined)

```typescript
import {
  cachedChatCompletion,
  cachedEmbedding,
  cachedAnthropicMessage,
} from "@/lib/ai-utils";

// Cached OpenAI chat (default: 1 hour cache)
const response = await cachedChatCompletion({
  model: "gpt-4",
  messages: [{ role: "user", content: "Analyze this code" }],
  temperature: 0.7,
});

// Cached embeddings (default: 24 hour cache)
const embedding = await cachedEmbedding("text to embed");

// Cached Anthropic (with custom options)
const claudeResponse = await cachedAnthropicMessage(
  {
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello" }],
  },
  {
    useCache: true,
    cacheTTL: 3600, // 1 hour
    timeout: 60000, // 1 minute
  }
);
```

## 📋 Available Timeouts

```typescript
TIMEOUTS.AI_GENERATION      // 2 minutes
TIMEOUTS.AI_EMBEDDING       // 30 seconds
TIMEOUTS.AI_CHAT            // 1 minute
TIMEOUTS.EXTERNAL_API       // 30 seconds
TIMEOUTS.WEBHOOK            // 10 seconds
TIMEOUTS.DATABASE_QUERY     // 30 seconds
TIMEOUTS.DATABASE_TRANSACTION // 1 minute
TIMEOUTS.FILE_UPLOAD        // 1 minute
TIMEOUTS.FILE_DOWNLOAD      // 1 minute
TIMEOUTS.GITHUB_API         // 30 seconds
TIMEOUTS.DOCKER_BUILD       // 5 minutes
TIMEOUTS.DOCKER_START       // 1 minute
TIMEOUTS.DOCKER_STOP        // 30 seconds
TIMEOUTS.DEFAULT            // 30 seconds
```

## 📋 Available Cache TTLs

```typescript
CACHE_TTL.AI_CHAT_RESPONSE          // 1 hour
CACHE_TTL.AI_EMBEDDING              // 24 hours
CACHE_TTL.AI_ANALYSIS               // 1 hour
CACHE_TTL.GITHUB_API                // 5 minutes
CACHE_TTL.EXTERNAL_API              // 10 minutes
CACHE_TTL.PROJECT_STATS             // 5 minutes
CACHE_TTL.USER_PREFERENCES          // 30 minutes
CACHE_TTL.LANDING_PAGE_ANALYTICS    // 5 minutes
CACHE_TTL.VALIDATION_RESULTS        // 1 hour
CACHE_TTL.DOCUMENTATION             // 30 minutes
CACHE_TTL.RATE_LIMIT                // 1 minute
CACHE_TTL.SESSION_DATA              // 15 minutes
CACHE_TTL.DEFAULT                   // 5 minutes
```

## 🎯 Common Patterns

### Pattern 1: API Route with Caching

```typescript
// src/app/api/expensive-operation/route.ts
import { getCachedOrCompute, CACHE_TTL } from "@/lib/cache";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const result = await getCachedOrCompute(
    `expensive-op:${projectId}`,
    async () => {
      // Expensive operation here
      return await performExpensiveAnalysis(projectId);
    },
    {
      ttl: CACHE_TTL.AI_ANALYSIS,
      prefix: "api",
    }
  );

  return NextResponse.json(result);
}
```

### Pattern 2: Agent with Timeout and Caching

```typescript
import { withAITimeout } from "@/lib/timeout";
import { cachedChatCompletion } from "@/lib/ai-utils";

class MyAgent {
  async execute(input: string) {
    // Use cached AI call (automatically has timeout)
    const analysis = await cachedChatCompletion({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are an expert analyst" },
        { role: "user", content: input },
      ],
    });

    // Or wrap custom operations with timeout
    const result = await withAITimeout(
      async () => {
        // Your custom AI operation
        return await someOtherOperation();
      },
      "Custom AI operation"
    );

    return { analysis, result };
  }
}
```

### Pattern 3: Cache Function Decorator

```typescript
import { cached, CACHE_TTL } from "@/lib/cache";

// Wrap expensive function with caching
const getCachedAnalysis = cached(
  async (projectId: string) => {
    return await expensiveAnalysis(projectId);
  },
  {
    ttl: CACHE_TTL.AI_ANALYSIS,
    prefix: "analysis",
  }
);

// Use it anywhere
const analysis = await getCachedAnalysis("project-123");
```

### Pattern 4: Cache Invalidation

```typescript
import { deleteCache, invalidateCachePrefix } from "@/lib/cache";

// Invalidate specific key
await deleteCache("analysis:abc123");

// Invalidate all keys with prefix
await invalidateCachePrefix("analysis");

// Common pattern: invalidate after update
async function updateProject(projectId: string, data: any) {
  await prisma.project.update({ where: { id: projectId }, data });

  // Invalidate all caches for this project
  await invalidateCachePrefix(`project:${projectId}`);
}
```

### Pattern 5: External API Call with Timeout

```typescript
import { fetchWithTimeout, TIMEOUTS } from "@/lib/timeout";

async function fetchGitHubData(repo: string) {
  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${repo}`,
      {
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        },
      },
      TIMEOUTS.GITHUB_API
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof TimeoutError) {
      logger.error("GitHub API timeout", error);
      // Handle timeout gracefully
      return null;
    }
    throw error;
  }
}
```

## ⚙️ Configuration

### Environment Variables

```bash
# Required for production caching
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# Optional - for vector embeddings
UPSTASH_VECTOR_REST_URL=https://your-vector.upstash.io
UPSTASH_VECTOR_REST_TOKEN=your-token
```

### Behavior

- **With Redis**: Uses Redis for distributed caching (production)
- **Without Redis**: Falls back to in-memory caching (development)
- **Timeouts**: Always active regardless of Redis configuration

## 🔍 Monitoring

All timeout and cache operations are logged:

```typescript
// Timeout logs
logger.error(`Timeout: OpenAI chat completion exceeded 120000ms`);

// Cache logs
logger.debug("Cache hit", { key: "analysis:abc123" });
logger.debug("Cache miss", { key: "analysis:abc123" });
logger.info("Invalidated 15 cache entries", { prefix: "analysis" });
```

## 🚨 Error Handling

```typescript
import { TimeoutError } from "@/lib/timeout";

try {
  const result = await withTimeout(slowOperation(), 5000);
} catch (error) {
  if (error instanceof TimeoutError) {
    // Handle timeout specifically
    console.error("Operation timed out:", error.message);
  } else {
    // Handle other errors
    throw error;
  }
}
```

## 📊 Best Practices

1. **Always use timeouts for external APIs** - Prevents hanging requests
2. **Cache expensive AI operations** - Save costs and improve performance
3. **Use appropriate TTLs** - Balance freshness vs. performance
4. **Invalidate caches on updates** - Keep data consistent
5. **Monitor cache hit rates** - Optimize cache strategy
6. **Use cache prefixes** - Organize and bulk invalidate related data
7. **Handle timeout errors gracefully** - Provide fallbacks or retries

## 🔄 Migration Guide

### Before (No Timeout or Caching)

```typescript
// ❌ Risky - could hang forever
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});
```

### After (With Timeout and Caching)

```typescript
// ✅ Safe and efficient
import { cachedChatCompletion } from "@/lib/ai-utils";

const response = await cachedChatCompletion({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
});
```

This automatically:
- ✅ Has 2-minute timeout
- ✅ Caches for 1 hour
- ✅ Falls back to in-memory in development
- ✅ Handles errors gracefully
