// src/middleware.ts
/**
 * Next.js Middleware
 *
 * Applies security headers and other middleware to all requests
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  // Security Headers

  // Content Security Policy (CSP)
  //
  // Known trade-off: script-src includes 'unsafe-inline' and
  // 'unsafe-eval'. Both are normally CSP weaknesses, but they are
  // currently required because:
  //   1. Next.js 15 inlines bootstrap scripts that need 'unsafe-inline'
  //   2. The Google Analytics + Hotjar bootstrap scripts in
  //      app/layout.tsx use dangerouslySetInnerHTML (inline)
  //   3. Some third-party tracking scripts evaluate dynamic code
  //
  // The right long-term fix is nonce-based CSP (generate a per-request
  // nonce in the middleware, attach it to NextResponse, then pass it
  // to the <Script> components). That is a meaningful refactor and
  // is captured in the maintainability pass scope. Until then, the
  // remaining XSS defence is the user-input sanitisation pass we
  // just shipped (renderUserContent + SECURITY NOTE blocks on every
  // LLM call) plus the prompt-injection rejection at every hop.
  //
  // Removed `t.contentsquare.net` from both script-src and connect-src
  // — it was in the allow-list but never used in the codebase. Dead
  // allow-list entries widen the attack surface for zero benefit.
  const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://va.vercel-scripts.com https://www.googletagmanager.com https://static.hotjar.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://vercel.live https://vitals.vercel-insights.com https://www.google-analytics.com https://www.googletagmanager.com https://*.hotjar.com",
    "worker-src 'self' blob:",
    // 'self' (not 'none') because the validation page preview at
    // /discovery/validation/[pageId] embeds /lp/[slug] inside an
    // iframe on the same origin. External sites are still blocked
    // from framing us — this is clickjacking protection, not a
    // same-origin lockdown.
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", cspHeader);

  // Prevent clickjacking. SAMEORIGIN (not DENY) to match the
  // frame-ancestors 'self' CSP directive above — the validation page
  // preview iframes /lp/[slug] from the same origin, which DENY
  // would block. SAMEORIGIN still blocks external sites from
  // framing us.
  response.headers.set("X-Frame-Options", "SAMEORIGIN");

  // Prevent MIME type sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");

  // X-XSS-Protection is deliberately NOT set. The header was
  // deprecated by all major browsers and the OWASP Secure Headers
  // project recommends against using it — historical implementations
  // had bugs that could be exploited to INJECT XSS into otherwise
  // safe pages. Modern XSS defence comes from the CSP above and
  // input sanitisation, not from this header.

  // Referrer Policy - don't leak referrer information
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions Policy - restrict browser features
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  // Strict Transport Security (HSTS) - force HTTPS
  // Only enable this in production when HTTPS is configured
  if (env.NODE_ENV === "production") {
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
