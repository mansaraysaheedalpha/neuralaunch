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
import { randomBytes, createHash } from 'crypto';
import { env } from '@/lib/env';

// The state parameter carries the mobile redirect URI through the
// OAuth dance. It's HMAC'd so an attacker can't inject a malicious
// redirect URI by crafting their own state.
function signState(redirectUri: string): string {
  const nonce = randomBytes(16).toString('hex');
  const payload = `${nonce}:${redirectUri}`;
  const signature = createHash('sha256')
    .update(`${env.NEXTAUTH_SECRET}:${payload}`)
    .digest('hex')
    .slice(0, 16);
  // base64url so it's URL-safe
  return Buffer.from(`${signature}:${payload}`).toString('base64url');
}

export function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString();
    const [signature, ...rest] = decoded.split(':');
    const payload = rest.join(':');
    const [, ...uriParts] = payload.split(':');
    const redirectUri = uriParts.join(':');

    const expected = createHash('sha256')
      .update(`${env.NEXTAUTH_SECRET}:${payload}`)
      .digest('hex')
      .slice(0, 16);

    if (signature !== expected) return null;
    return redirectUri;
  } catch {
    return null;
  }
}

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
    clientId: env.GITHUB_CLIENT_ID,
    scope:    'read:user user:email',
  },
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
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
}
