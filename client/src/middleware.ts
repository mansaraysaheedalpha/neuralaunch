// src/middleware.ts
/**
 * Next.js Middleware
 * 
 * Applies security headers and other middleware to all requests
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  // Security Headers
  
  // Content Security Policy (CSP)
  // Adjust as needed for your specific third-party integrations
  const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://va.vercel-scripts.com https://www.googletagmanager.com https://static.hotjar.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://vercel.live https://vitals.vercel-insights.com https://www.google-analytics.com https://www.googletagmanager.com https://*.hotjar.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  
  response.headers.set("Content-Security-Policy", cspHeader);

  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Enable XSS filtering in older browsers
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // Referrer Policy - don't leak referrer information
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions Policy - restrict browser features
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  // Strict Transport Security (HSTS) - force HTTPS
  // Only enable this in production when HTTPS is configured
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  return response;
}

// Apply middleware to all routes except static files and API routes that handle their own security
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
