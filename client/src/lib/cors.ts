// src/lib/cors.ts
/**
 * CORS (Cross-Origin Resource Sharing) Configuration
 *
 * Provides proper CORS headers for cross-origin API requests
 * Configurable for different environments and use cases
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "./env";
import { logger } from "./logger";

// ==========================================
// CORS CONFIGURATION
// ==========================================

/**
 * CORS configuration options
 */
export interface CORSOptions {
  /**
   * Allowed origins (domains that can make requests)
   * - Use "*" to allow all origins (not recommended for production)
   * - Use specific domains for security
   * - Can be a string, array of strings, or function
   */
  allowedOrigins?: string | string[] | ((origin: string) => boolean);

  /**
   * Allowed HTTP methods
   * Default: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
   */
  allowedMethods?: string[];

  /**
   * Allowed headers
   * Default: ["Content-Type", "Authorization"]
   */
  allowedHeaders?: string[];

  /**
   * Exposed headers (headers the browser can access)
   */
  exposedHeaders?: string[];

  /**
   * Allow credentials (cookies, authorization headers)
   * Default: true
   */
  allowCredentials?: boolean;

  /**
   * Preflight cache duration in seconds
   * Default: 86400 (24 hours)
   */
  maxAge?: number;

  /**
   * Vary header value
   * Default: "Origin"
   */
  varyHeader?: string;
}

/**
 * Default CORS configuration
 */
const DEFAULT_CORS_CONFIG: Required<CORSOptions> = {
  allowedOrigins: getAllowedOrigins(),
  allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers",
  ],
  exposedHeaders: [
    "Content-Length",
    "Content-Type",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
  ],
  allowCredentials: true,
  maxAge: 86400, // 24 hours
  varyHeader: "Origin",
};

/**
 * Get allowed origins from environment or defaults
 */
function getAllowedOrigins(): string[] {
  // Check if CORS_ALLOWED_ORIGINS is set in environment
  if (env.CORS_ALLOWED_ORIGINS) {
    return env.CORS_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
  }

  // Default allowed origins based on environment
  const origins: string[] = [];

  // Always allow the main app URL
  if (env.NEXT_PUBLIC_APP_URL) {
    origins.push(env.NEXT_PUBLIC_APP_URL);
  }

  if (env.NEXT_PUBLIC_SITE_URL) {
    origins.push(env.NEXT_PUBLIC_SITE_URL);
  }

  // In development, allow localhost
  if (env.NODE_ENV === "development") {
    origins.push("http://localhost:3000");
    origins.push("http://localhost:3001");
    origins.push("http://127.0.0.1:3000");
    origins.push("http://127.0.0.1:3001");
  }

  // If no origins configured, log a warning
  if (origins.length === 0) {
    logger.warn(
      "No CORS origins configured. Using default: allow current origin only."
    );
  }

  return origins;
}

/**
 * Check if an origin is allowed
 */
function isOriginAllowed(
  origin: string | null,
  allowedOrigins: string | string[] | ((origin: string) => boolean)
): boolean {
  if (!origin) {
    return false;
  }

  // Allow all origins
  if (allowedOrigins === "*") {
    return true;
  }

  // Function-based check
  if (typeof allowedOrigins === "function") {
    return allowedOrigins(origin);
  }

  // Array of allowed origins
  if (Array.isArray(allowedOrigins)) {
    return allowedOrigins.some((allowed) => {
      // Exact match
      if (allowed === origin) {
        return true;
      }

      // Wildcard subdomain match (e.g., "*.example.com")
      if (allowed.startsWith("*.")) {
        const domain = allowed.substring(2);
        return origin.endsWith(domain);
      }

      return false;
    });
  }

  // Single origin string
  return allowedOrigins === origin;
}

// ==========================================
// CORS MIDDLEWARE
// ==========================================

/**
 * Add CORS headers to a response
 */
export function addCORSHeaders(
  response: NextResponse,
  request: NextRequest,
  options: CORSOptions = {}
): NextResponse {
  const config = { ...DEFAULT_CORS_CONFIG, ...options };
  const origin = request.headers.get("origin");

  // Check if origin is allowed
  if (origin && isOriginAllowed(origin, config.allowedOrigins)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  } else if (config.allowedOrigins === "*") {
    response.headers.set("Access-Control-Allow-Origin", "*");
  }

  // Set other CORS headers
  response.headers.set(
    "Access-Control-Allow-Methods",
    config.allowedMethods.join(", ")
  );

  response.headers.set(
    "Access-Control-Allow-Headers",
    config.allowedHeaders.join(", ")
  );

  if (config.exposedHeaders.length > 0) {
    response.headers.set(
      "Access-Control-Expose-Headers",
      config.exposedHeaders.join(", ")
    );
  }

  if (config.allowCredentials) {
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  response.headers.set("Access-Control-Max-Age", config.maxAge.toString());

  // Add Vary header for caching
  response.headers.set("Vary", config.varyHeader);

  return response;
}

/**
 * Handle CORS preflight (OPTIONS) requests
 */
export function handleCORSPreflight(
  request: NextRequest,
  options: CORSOptions = {}
): NextResponse | null {
  // Only handle OPTIONS requests
  if (request.method !== "OPTIONS") {
    return null;
  }

  const response = new NextResponse(null, { status: 204 });
  return addCORSHeaders(response, request, options);
}

/**
 * CORS middleware wrapper for API routes
 *
 * @example
 * ```typescript
 * export async function GET(req: NextRequest) {
 *   return withCORS(req, async () => {
 *     // Your API logic here
 *     return NextResponse.json({ data: "Hello" });
 *   });
 * }
 * ```
 */
export async function withCORS(
  request: NextRequest,
  handler: () => Promise<NextResponse> | NextResponse,
  options: CORSOptions = {}
): Promise<NextResponse> {
  // Handle preflight requests
  const preflightResponse = handleCORSPreflight(request, options);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Execute the handler
  try {
    const response = await handler();
    return addCORSHeaders(response, request, options);
  } catch (error) {
    logger.error("Error in CORS-wrapped handler", error as Error);

    // Return error response with CORS headers
    const errorResponse = NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
    return addCORSHeaders(errorResponse, request, options);
  }
}

/**
 * Create a CORS-enabled API handler
 *
 * @example
 * ```typescript
 * export const GET = createCORSHandler(async (req) => {
 *   return NextResponse.json({ data: "Hello" });
 * });
 * ```
 */
export function createCORSHandler(
  handler: (request: NextRequest) => Promise<NextResponse> | NextResponse,
  options: CORSOptions = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    return withCORS(request, () => handler(request), options);
  };
}

// ==========================================
// PRESET CORS CONFIGURATIONS
// ==========================================

/**
 * CORS configuration for public APIs (more permissive)
 */
export const PUBLIC_API_CORS: CORSOptions = {
  allowedOrigins: "*",
  allowCredentials: false,
  allowedMethods: ["GET", "POST", "OPTIONS"],
};

/**
 * CORS configuration for authenticated APIs (more restrictive)
 */
export const AUTHENTICATED_API_CORS: CORSOptions = {
  allowedOrigins: getAllowedOrigins(),
  allowCredentials: true,
  allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};

/**
 * CORS configuration for webhooks (POST only)
 */
export const WEBHOOK_CORS: CORSOptions = {
  allowedOrigins: "*",
  allowCredentials: false,
  allowedMethods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Webhook-Signature"],
};

/**
 * CORS configuration for landing pages (public, read-only)
 */
export const LANDING_PAGE_CORS: CORSOptions = {
  allowedOrigins: "*",
  allowCredentials: false,
  allowedMethods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};
