# Error Handling Guide

## Overview

This guide documents the comprehensive error handling infrastructure in the IdeaSpark application. All API routes and services should follow these patterns for consistent, robust error handling.

## Table of Contents

1. [Error Handling Infrastructure](#error-handling-infrastructure)
2. [Error Classes](#error-classes)
3. [API Route Patterns](#api-route-patterns)
4. [Error Response Format](#error-response-format)
5. [Best Practices](#best-practices)
6. [Examples](#examples)

## Error Handling Infrastructure

### Core Utilities

Located in `src/lib/api-error.ts`:

- **Error Classes**: Specialized error types for different scenarios
- **handleApiError()**: Central error handler that converts errors to standardized responses
- **ErrorResponses**: Pre-built error responses for common scenarios
- **withTimeout()**: Wraps promises with timeout protection
- **withRetry()**: Implements exponential backoff retry logic
- **safeAsyncOperation()**: Comprehensive async operation wrapper

Located in `src/lib/api-response.ts`:

- **successResponse()**: Standardized success response format
- **paginatedResponse()**: Paginated data response format
- **createdResponse()**: 201 Created response
- **noContentResponse()**: 204 No Content response

Located in `src/lib/logger.ts`:

- **logger**: Centralized logging utility with context support
- **createApiLogger()**: API-specific logger with request context

## Error Classes

### Built-in Error Classes

```typescript
// Generic API error
new ApiError(statusCode, message, details?)

// Validation error (400)
new ValidationError(message, details?)

// Authentication error (401)
new AuthenticationError(message?)

// Authorization error (403)
new AuthorizationError(message?)

// Not found error (404)
new NotFoundError(resource?)

// Rate limit error (429)
new RateLimitError(retryAfter?)

// External service error (503)
new ExternalServiceError(service, message?)

// Timeout error (504)
new TimeoutError(operation, timeoutMs)
```

### When to Use Each Error Class

- **ValidationError**: Input validation failures, malformed requests
- **AuthenticationError**: Missing or invalid authentication
- **AuthorizationError**: Authenticated but not authorized for the resource
- **NotFoundError**: Resource doesn't exist or user doesn't have access
- **RateLimitError**: Rate limit exceeded
- **ExternalServiceError**: Third-party service failures (AI APIs, email services)
- **TimeoutError**: Operations that exceed time limits

## API Route Patterns

### Standard Pattern

```typescript
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { handleApiError, ErrorResponses, NotFoundError } from "@/lib/api-error";
import { successResponse } from "@/lib/api-response";

// Define validation schema
const requestSchema = z.object({
  field: z.string().min(1),
  // ... more fields
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication check
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    // 2. Validate input
    const body: unknown = await req.json();
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return handleApiError(validation.error, "POST /api/your-route");
    }
    const { field } = validation.data;

    // 3. Verify resource ownership/access
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId, userId: session.user.id },
    });
    if (!resource) {
      throw new NotFoundError("Resource");
    }

    // 4. Perform business logic
    const result = await performOperation(resource);

    // 5. Return success response
    return successResponse(result, "Operation completed successfully");
  } catch (error) {
    // 6. Handle all errors consistently
    return handleApiError(error, "POST /api/your-route");
  }
}
```

### Pattern with Dynamic Routes

```typescript
const paramsSchema = z.object({
  id: z.string().cuid(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    const rawParams = await params;
    const validation = paramsSchema.safeParse(rawParams);
    if (!validation.success) {
      return ErrorResponses.badRequest("Invalid ID format");
    }
    
    const { id } = validation.data;
    
    // ... rest of the logic
  } catch (error) {
    return handleApiError(error, "GET /api/your-route/[id]");
  }
}
```

### Pattern with External Services

```typescript
import { ExternalServiceError, withTimeout } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  try {
    // ... authentication and validation

    // Wrap external service calls with timeout
    const result = await withTimeout(
      externalService.call(data),
      30000, // 30 second timeout
      "External Service API"
    );

    return successResponse(result);
  } catch (error) {
    // External service errors are automatically handled
    return handleApiError(error, "POST /api/your-route");
  }
}
```

## Error Response Format

### Success Response

```json
{
  "success": true,
  "data": { /* your data */ },
  "timestamp": "2025-10-26T17:40:22.111Z",
  "message": "Optional success message"
}
```

### Error Response

```json
{
  "error": "ErrorType",
  "message": "Human-readable error message",
  "statusCode": 400,
  "timestamp": "2025-10-26T17:40:22.111Z",
  "details": { /* optional error details */ }
}
```

### Validation Error Response

```json
{
  "error": "ValidationError",
  "message": "Invalid request data",
  "statusCode": 400,
  "timestamp": "2025-10-26T17:40:22.111Z",
  "details": [
    {
      "path": "email",
      "message": "Invalid email address"
    }
  ]
}
```

## Best Practices

### DO ✅

1. **Always use try-catch blocks** in API routes
2. **Always authenticate first** before any business logic
3. **Always validate input** using Zod schemas
4. **Always provide context** to handleApiError (route name)
5. **Use specific error classes** instead of generic Error
6. **Return structured responses** using response utilities
7. **Log errors with context** using the logger utility
8. **Wrap external calls** with timeout protection
9. **Check resource ownership** before operations
10. **Use descriptive error messages** for debugging

### DON'T ❌

1. **Don't expose internal errors** in production
2. **Don't use console.error** directly (use logger instead)
3. **Don't return raw error objects** to clients
4. **Don't forget to await params** in dynamic routes
5. **Don't skip validation** even for trusted inputs
6. **Don't use generic NextResponse** for errors
7. **Don't hardcode status codes** (use error classes)
8. **Don't ignore error context** in catch blocks
9. **Don't leak sensitive information** in error messages
10. **Don't retry on client errors** (4xx status codes)

## Examples

### Example 1: Simple GET with Authentication

```typescript
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    const data = await prisma.resource.findMany({
      where: { userId: session.user.id },
    });

    return successResponse(data);
  } catch (error) {
    return handleApiError(error, "GET /api/resources");
  }
}
```

### Example 2: POST with Validation

```typescript
const createSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    const body: unknown = await req.json();
    const validation = createSchema.safeParse(body);
    if (!validation.success) {
      return handleApiError(validation.error, "POST /api/resources");
    }

    const resource = await prisma.resource.create({
      data: {
        ...validation.data,
        userId: session.user.id,
      },
    });

    return createdResponse(resource, "Resource created successfully");
  } catch (error) {
    return handleApiError(error, "POST /api/resources");
  }
}
```

### Example 3: DELETE with Ownership Check

```typescript
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    const { id } = await params;

    // Use deleteMany to check ownership atomically
    const result = await prisma.resource.deleteMany({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (result.count === 0) {
      throw new NotFoundError("Resource");
    }

    return noContentResponse();
  } catch (error) {
    return handleApiError(error, "DELETE /api/resources/[id]");
  }
}
```

### Example 4: Complex Operation with External Services

```typescript
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ErrorResponses.unauthorized();
    }

    const body: unknown = await req.json();
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return handleApiError(validation.error, "POST /api/complex-operation");
    }

    // Database operation
    const dbResult = await prisma.resource.create({
      data: validation.data,
    });

    // External AI service call with timeout
    const aiResult = await withTimeout(
      aiService.analyze(dbResult),
      60000, // 1 minute timeout
      "AI Analysis"
    );

    // Update with AI results
    const finalResult = await prisma.resource.update({
      where: { id: dbResult.id },
      data: { analysis: aiResult },
    });

    return successResponse(finalResult);
  } catch (error) {
    return handleApiError(error, "POST /api/complex-operation");
  }
}
```

## Testing Error Handling

### Unit Test Example

```typescript
describe("API Error Handling", () => {
  it("should return 401 for unauthenticated requests", async () => {
    const response = await GET(mockRequest);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should return 400 for invalid input", async () => {
    const response = await POST(mockRequestWithInvalidData);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("ValidationError");
  });

  it("should return 404 for non-existent resources", async () => {
    const response = await GET(mockRequestWithInvalidId);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("NotFoundError");
  });
});
```

## Migration Checklist

When updating existing API routes to use the new error handling:

- [ ] Import required utilities from `@/lib/api-error` and `@/lib/api-response`
- [ ] Replace authentication checks with `ErrorResponses.unauthorized()`
- [ ] Add Zod validation schemas for all inputs
- [ ] Use `handleApiError()` in catch blocks with route context
- [ ] Replace `NextResponse.json()` with `successResponse()` or other utilities
- [ ] Add specific error classes (NotFoundError, etc.) where appropriate
- [ ] Remove console.error/console.log in favor of logger
- [ ] Add timeout protection for external service calls
- [ ] Verify error messages don't leak sensitive information
- [ ] Test all error paths

## Monitoring and Logging

All errors are automatically logged with:
- Timestamp
- Error type and message
- Stack trace (in development)
- Request context (route, user ID if available)
- Additional metadata

In production, logs should be sent to a centralized logging service like:
- Sentry
- LogRocket
- CloudWatch
- Datadog

Configure the logging service in `src/lib/logger.ts` in the `sendToLoggingService()` method.

## Additional Resources

- [Zod Documentation](https://zod.dev/)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Error Handling Best Practices](https://www.joyent.com/node-js/production/design/errors)

---

**Last Updated**: October 26, 2025  
**Maintainers**: Development Team
