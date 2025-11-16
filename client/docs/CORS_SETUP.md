# CORS Configuration Guide

This guide explains how to configure and use CORS (Cross-Origin Resource Sharing) in your Next.js application.

## 🚀 Quick Start

### Method 1: Using `withCORS` wrapper (Recommended)

```typescript
// src/app/api/my-endpoint/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withCORS } from "@/lib/cors";

export async function GET(req: NextRequest) {
  return withCORS(req, async () => {
    // Your API logic here
    return NextResponse.json({ message: "Hello World" });
  });
}

export async function POST(req: NextRequest) {
  return withCORS(req, async () => {
    const body = await req.json();
    // Handle POST request
    return NextResponse.json({ success: true });
  });
}

// OPTIONS requests are automatically handled
```

### Method 2: Using `createCORSHandler` (Even Simpler)

```typescript
// src/app/api/my-endpoint/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createCORSHandler } from "@/lib/cors";

export const GET = createCORSHandler(async (req) => {
  return NextResponse.json({ message: "Hello World" });
});

export const POST = createCORSHandler(async (req) => {
  const body = await req.json();
  return NextResponse.json({ success: true });
});

// OPTIONS is auto-handled, no need to export it
```

### Method 3: Using Preset Configurations

```typescript
import { withCORS, PUBLIC_API_CORS, AUTHENTICATED_API_CORS } from "@/lib/cors";

// Public API (anyone can access)
export async function GET(req: NextRequest) {
  return withCORS(req, async () => {
    return NextResponse.json({ data: "Public data" });
  }, PUBLIC_API_CORS);
}

// Authenticated API (only allowed origins)
export async function POST(req: NextRequest) {
  return withCORS(req, async () => {
    // Verify auth, then return data
    return NextResponse.json({ data: "Protected data" });
  }, AUTHENTICATED_API_CORS);
}
```

## ⚙️ Configuration

### Environment Variables

Add to your `.env.local`:

```bash
# Optional: Comma-separated list of allowed origins
CORS_ALLOWED_ORIGINS=https://example.com,https://app.example.com,https://*.vercel.app

# If not set, defaults to:
# - NEXT_PUBLIC_APP_URL
# - NEXT_PUBLIC_SITE_URL
# - localhost:3000 (in development)
```

### Default Behavior

Without configuration:
- **Development**: Allows `localhost:3000`, `localhost:3001`, and your app URLs
- **Production**: Only allows origins from `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL`

## 🎯 Preset Configurations

### 1. PUBLIC_API_CORS
For public APIs that anyone can access:

```typescript
import { PUBLIC_API_CORS } from "@/lib/cors";

// Allows:
// - All origins (*)
// - No credentials
// - GET, POST, OPTIONS only
```

### 2. AUTHENTICATED_API_CORS
For protected APIs requiring authentication:

```typescript
import { AUTHENTICATED_API_CORS } from "@/lib/cors";

// Allows:
// - Configured origins only
// - Credentials (cookies, auth headers)
// - All HTTP methods
```

### 3. WEBHOOK_CORS
For webhook endpoints:

```typescript
import { WEBHOOK_CORS } from "@/lib/cors";

// Allows:
// - All origins
// - No credentials
// - POST only
// - Webhook signature header
```

### 4. LANDING_PAGE_CORS
For landing pages with forms:

```typescript
import { LANDING_PAGE_CORS } from "@/lib/cors";

// Allows:
// - All origins
// - No credentials
// - GET, POST only
```

## 📋 Custom Configuration

Create your own CORS configuration:

```typescript
import { withCORS, type CORSOptions } from "@/lib/cors";

const customCORS: CORSOptions = {
  // Allow specific domains
  allowedOrigins: [
    "https://example.com",
    "https://app.example.com",
    "*.example.com", // Wildcard subdomains
  ],

  // Or use a function for dynamic checking
  // allowedOrigins: (origin) => origin.endsWith(".example.com"),

  // Or allow all (not recommended for production)
  // allowedOrigins: "*",

  // HTTP methods
  allowedMethods: ["GET", "POST", "PUT", "DELETE"],

  // Headers clients can send
  allowedHeaders: ["Content-Type", "Authorization", "X-Custom-Header"],

  // Headers clients can read
  exposedHeaders: ["X-Total-Count", "X-Page-Number"],

  // Allow cookies and auth
  allowCredentials: true,

  // Preflight cache duration (seconds)
  maxAge: 86400, // 24 hours

  // Vary header for caching
  varyHeader: "Origin",
};

export const GET = createCORSHandler(async (req) => {
  return NextResponse.json({ data: "Hello" });
}, customCORS);
```

## 🔍 Common Use Cases

### Use Case 1: Public Landing Page API

```typescript
// src/app/api/landing-page/signup/route.ts
import { withCORS, LANDING_PAGE_CORS } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return withCORS(req, async () => {
    const { email } = await req.json();

    // Store email signup
    await prisma.emailSignup.create({
      data: { email, landingPageId: "..." },
    });

    return NextResponse.json({ success: true });
  }, LANDING_PAGE_CORS);
}
```

### Use Case 2: Authenticated Dashboard API

```typescript
// src/app/api/projects/[id]/route.ts
import { withCORS, AUTHENTICATED_API_CORS } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  return withCORS(req, async () => {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const project = await prisma.project.findUnique({...});
    return NextResponse.json(project);
  }, AUTHENTICATED_API_CORS);
}
```

### Use Case 3: Webhook Endpoint

```typescript
// src/app/api/webhooks/stripe/route.ts
import { withCORS, WEBHOOK_CORS } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return withCORS(req, async () => {
    const signature = req.headers.get("stripe-signature");

    // Verify and process webhook
    const event = await verifyWebhook(req, signature);

    return NextResponse.json({ received: true });
  }, WEBHOOK_CORS);
}
```

### Use Case 4: Custom Origin Validation

```typescript
import { withCORS } from "@/lib/cors";

export async function GET(req: NextRequest) {
  return withCORS(req, async () => {
    return NextResponse.json({ data: "Hello" });
  }, {
    // Only allow subdomains of example.com
    allowedOrigins: (origin) => {
      return origin.endsWith(".example.com") || origin === "https://example.com";
    },
    allowCredentials: true,
  });
}
```

## 🔒 Security Best Practices

### 1. Be Specific with Origins

❌ **Bad** (too permissive):
```typescript
allowedOrigins: "*",
allowCredentials: true,  // DANGER!
```

✅ **Good** (specific origins):
```typescript
allowedOrigins: [
  "https://app.example.com",
  "https://www.example.com",
],
allowCredentials: true,
```

### 2. Use Environment-Based Configuration

```typescript
const allowedOrigins = process.env.NODE_ENV === "production"
  ? ["https://app.example.com"]
  : ["http://localhost:3000", "https://app.example.com"];
```

### 3. Validate Request Origin

```typescript
export async function POST(req: NextRequest) {
  return withCORS(req, async () => {
    const origin = req.headers.get("origin");

    // Additional validation
    if (!origin || !isAllowedOrigin(origin)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Process request
    return NextResponse.json({ success: true });
  });
}
```

### 4. Disable Credentials for Public APIs

```typescript
// Public API - no credentials needed
export const GET = createCORSHandler(async (req) => {
  return NextResponse.json({ data: "Public data" });
}, {
  allowedOrigins: "*",
  allowCredentials: false,  // Safe with wildcard
});
```

## 📊 Testing CORS

### Using cURL

```bash
# Test preflight request
curl -i -X OPTIONS http://localhost:3000/api/my-endpoint \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"

# Test actual request
curl -i -X GET http://localhost:3000/api/my-endpoint \
  -H "Origin: https://example.com"
```

### Using Browser Console

```javascript
// From https://example.com
fetch('http://localhost:3000/api/my-endpoint', {
  method: 'GET',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
})
  .then(res => res.json())
  .then(data => console.log(data))
  .catch(err => console.error('CORS error:', err));
```

### Expected Response Headers

```
Access-Control-Allow-Origin: https://example.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
Vary: Origin
```

## 🐛 Troubleshooting

### Issue: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Solution**: Make sure you're using the CORS wrapper:
```typescript
export const GET = createCORSHandler(async (req) => {
  // Your handler
});
```

### Issue: "Credentials mode is 'include' but CORS response omits credentials"

**Solution**: Ensure `allowCredentials` is `true`:
```typescript
{
  allowCredentials: true,
  allowedOrigins: ["https://example.com"], // Cannot use "*" with credentials
}
```

### Issue: Preflight request failing

**Solution**: Ensure OPTIONS method is handled:
```typescript
// Automatically handled by withCORS or createCORSHandler
export const OPTIONS = createCORSHandler(async (req) => {
  return new NextResponse(null, { status: 204 });
});
```

### Issue: Origin not in allowed list

**Solution**: Check your environment variables:
```bash
CORS_ALLOWED_ORIGINS=https://example.com,https://app.example.com
```

## 📚 Additional Resources

- [MDN CORS Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Next.js Headers Documentation](https://nextjs.org/docs/app/api-reference/next-config-js/headers)
- [OWASP CORS Guide](https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny)

## 🎯 Summary

- ✅ Use `createCORSHandler` for simplest setup
- ✅ Use preset configurations (PUBLIC_API_CORS, etc.) for common cases
- ✅ Be specific with allowed origins in production
- ✅ Never use `allowedOrigins: "*"` with `allowCredentials: true`
- ✅ Test CORS in both development and production
- ✅ Configure `CORS_ALLOWED_ORIGINS` environment variable
