// src/app/api/auth/mobile/callback/route.ts
//
// GET /api/auth/mobile/callback?code=X&state=Y
//
// OAuth callback for mobile clients. Exchanges the authorization code
// for user info, creates or finds the user via the same Prisma models
// NextAuth uses, creates a Session row, and redirects to the mobile
// app's scheme with the session token as a query parameter.

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createMobileSession } from '@/lib/mobile-auth';
import { verifyState } from '../[provider]/route';

// ---------------------------------------------------------------------------
// Provider-specific token + profile fetchers
// ---------------------------------------------------------------------------

interface OAuthUser {
  email:    string;
  name:     string | null;
  image:    string | null;
  provider: string;
  providerAccountId: string;
}

async function exchangeGoogleCode(code: string, callbackUrl: string): Promise<OAuthUser> {
  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  callbackUrl,
      grant_type:    'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokens = await tokenRes.json() as { access_token: string };

  // Fetch user profile
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!profileRes.ok) {
    throw new Error('Google profile fetch failed');
  }

  const profile = await profileRes.json() as {
    id: string;
    email: string;
    name: string;
    picture: string;
  };

  return {
    email:             profile.email,
    name:              profile.name,
    image:             profile.picture,
    provider:          'google',
    providerAccountId: profile.id,
  };
}

async function exchangeGitHubCode(code: string): Promise<OAuthUser> {
  // Exchange code for access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id:     env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error('GitHub token exchange failed');
  }

  const tokens = await tokenRes.json() as { access_token: string };

  // Fetch user profile
  const profileRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!profileRes.ok) {
    throw new Error('GitHub profile fetch failed');
  }

  const profile = await profileRes.json() as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string;
  };

  // Fetch primary email (may not be in the profile)
  const emailRes = await fetch('https://api.github.com/user/emails', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  let email = `${profile.login}@users.noreply.github.com`;
  if (emailRes.ok) {
    const emails = await emailRes.json() as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    const primary = emails.find(e => e.primary && e.verified);
    if (primary) email = primary.email;
  }

  return {
    email,
    name:              profile.name ?? profile.login,
    image:             profile.avatar_url,
    provider:          'github',
    providerAccountId: String(profile.id),
  };
}

// ---------------------------------------------------------------------------
// Callback handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const log = logger.child({ route: 'GET /api/auth/mobile/callback' });

  // Handle OAuth errors (user denied, etc.)
  if (error) {
    log.info('OAuth error from provider', { error });
    // We don't know the redirect URI since there's no state, so
    // return a plain error page the mobile browser will show.
    return new NextResponse(
      `<html><body><h2>Sign-in failed</h2><p>${error}</p><p>Close this window and try again.</p></body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html' } },
    );
  }

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  // Parse state: "provider:signedPayload"
  const colonIdx = state.indexOf(':');
  if (colonIdx === -1) {
    return NextResponse.json({ error: 'Invalid state format' }, { status: 400 });
  }
  const provider = state.slice(0, colonIdx);
  const signedPayload = state.slice(colonIdx + 1);

  // Verify the HMAC and extract the mobile redirect URI
  const mobileRedirectUri = verifyState(signedPayload);
  if (!mobileRedirectUri) {
    log.warn('Invalid state signature — possible CSRF');
    return NextResponse.json({ error: 'Invalid state' }, { status: 403 });
  }

  const callbackUrl = `${env.NEXTAUTH_URL}/api/auth/mobile/callback`;

  try {
    // Exchange the code for user info — provider-specific
    let oauthUser: OAuthUser;
    if (provider === 'google') {
      oauthUser = await exchangeGoogleCode(code, callbackUrl);
    } else if (provider === 'github') {
      oauthUser = await exchangeGitHubCode(code);
    } else {
      return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }

    // Find or create the user — same logic as NextAuth's Prisma adapter
    // with allowDangerousEmailAccountLinking: true
    let user = await prisma.user.findUnique({
      where: { email: oauthUser.email },
      select: { id: true },
    });

    if (!user) {
      // Create new user + account
      user = await prisma.user.create({
        data: {
          email:         oauthUser.email,
          name:          oauthUser.name,
          image:         oauthUser.image,
          emailVerified: new Date(),
          accounts: {
            create: {
              type:              'oauth',
              provider:          oauthUser.provider,
              providerAccountId: oauthUser.providerAccountId,
            },
          },
        },
        select: { id: true },
      });
      log.info('New mobile user created', { userId: user.id, provider });
    } else {
      // Ensure the account link exists (same as allowDangerousEmailAccountLinking)
      const existingAccount = await prisma.account.findFirst({
        where: {
          userId:   user.id,
          provider: oauthUser.provider,
        },
        select: { id: true },
      });

      if (!existingAccount) {
        await prisma.account.create({
          data: {
            userId:            user.id,
            type:              'oauth',
            provider:          oauthUser.provider,
            providerAccountId: oauthUser.providerAccountId,
          },
        });
        log.info('Account linked to existing user', { userId: user.id, provider });
      }

      // Update profile fields if they're newer/better
      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(oauthUser.name  ? { name:  oauthUser.name }  : {}),
          ...(oauthUser.image ? { image: oauthUser.image } : {}),
        },
      });
    }

    // Create a mobile session
    const sessionToken = await createMobileSession(user.id);

    log.info('Mobile sign-in complete', { userId: user.id, provider });

    // Redirect to the mobile app with the token
    const redirectUrl = new URL(mobileRedirectUri);
    redirectUrl.searchParams.set('token', sessionToken);

    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    log.error(
      'Mobile OAuth callback failed',
      err instanceof Error ? err : new Error(String(err)),
    );
    return new NextResponse(
      `<html><body><h2>Sign-in failed</h2><p>Something went wrong. Close this window and try again.</p></body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } },
    );
  }
}
