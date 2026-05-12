// src/app/api/auth/mobile/[provider]/route.ts
//
// GET /api/auth/mobile/[provider]?redirect_uri=neuralaunch://auth/callback
//
// Initiates the OAuth flow for mobile clients. Builds the provider's
// authorization URL with a state parameter that encodes the mobile
// redirect URI, then redirects the user's browser to the provider.
//
// The callback lands at /api/auth/mobile/callback which creates the
// user (if new), creates a Session row, and redirects to the mobile
// app's scheme with the session token.

import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { signState } from '@/lib/mobile-auth';
import {
  httpErrorToResponse,
  rateLimitByIp,
  RATE_LIMITS,
} from '@/lib/validation/server-helpers';

// Provider configs — authorization URLs and required scopes
const PROVIDERS: Record<string, {
  authUrl: string;
  clientId: string;
  scope: string;
}> = {
  google: {
    authUrl:  'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: env.GOOGLE_CLIENT_ID,
    scope:    'openid email profile',
  },
  github: {
    authUrl:  'https://github.com/login/oauth/authorize',
    // GitHub OAuth Apps only permit one callback URL, so mobile uses a
    // dedicated "NeuraLaunch Mobile" OAuth App. Google's single client
    // supports multiple authorised redirects so it stays shared above.
    clientId: env.GITHUB_MOBILE_CLIENT_ID,
    scope:    'read:user user:email',
  },
  linkedin: {
    // LinkedIn supports multiple authorised redirect URIs per app, so
    // the web and mobile share the same LINKEDIN_CLIENT_ID. Add
    // {NEXTAUTH_URL}/api/auth/mobile/callback to the app's authorised
    // redirect URLs in the LinkedIn developer console alongside the
    // existing NextAuth web callback.
    authUrl:  'https://www.linkedin.com/oauth/v2/authorization',
    clientId: env.LINKEDIN_CLIENT_ID ?? '',
    scope:    'openid profile email',
  },
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    // IP-keyed AUTH tier (5/15min) — tighter than API_READ because
    // each invocation triggers HMAC CPU and a redirect to the OAuth
    // provider, both of which a script can abuse to burn server-side
    // work or get our client_id rate-limited at Google/GitHub.
    await rateLimitByIp(request, 'mobile-oauth-init', RATE_LIMITS.AUTH);

    const { provider } = await params;
    const url = new URL(request.url);
    const redirectUri = url.searchParams.get('redirect_uri');

    if (!redirectUri) {
      return NextResponse.json({ error: 'redirect_uri is required' }, { status: 400 });
    }

    const config = PROVIDERS[provider];
    if (!config) {
      return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }

    // Our callback URL — where the provider redirects after auth
    const callbackUrl = `${env.NEXTAUTH_URL}/api/auth/mobile/callback`;

    // State encodes the mobile redirect URI + HMAC signature
    const state = signState(redirectUri);

    // Build the provider's authorization URL
    const authParams = new URLSearchParams({
      client_id:     config.clientId,
      redirect_uri:  callbackUrl,
      response_type: 'code',
      scope:         config.scope,
      state:         `${provider}:${state}`,
      // Google-specific: force account selection so the user can switch accounts
      ...(provider === 'google' ? { prompt: 'select_account' } : {}),
    });

    return NextResponse.redirect(`${config.authUrl}?${authParams.toString()}`);
  } catch (err) {
    return httpErrorToResponse(err);
  }
}
