// src/app/signin/page.tsx
//
// Server-component wrapper for the sign-in surface. The prior
// version gated the LinkedIn button behind a server-side check on
// the LinkedIn env vars — that was hiding real misconfiguration
// behind silence. The button now always renders; if the OAuth
// credentials aren't set, NextAuth surfaces a proper error on
// click which is easier to debug than a missing button.

import type { Metadata } from "next";
import SignInClient from "./SignInClient";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to NeuraLaunch — one honest interview, one clear recommendation, a roadmap built around you.",
  robots: { index: false, follow: false },
};

interface SignInPageProps {
  // Next 15+ async searchParams. Two banner triggers handled here:
  //
  //   ?deleted=1     — DangerZone delete flow redirects here on
  //                    successful queue-and-signout, so the founder
  //                    gets an explicit ack of the destructive action.
  //
  //   ?error=<code>  — NextAuth's documented redirect on every
  //                    failed-auth path. Today the founder bounces
  //                    back here on AccessDenied (e.g. C3 GitHub
  //                    email-verification gate rejection),
  //                    Verification (expired magic link),
  //                    OAuthAccountNotLinked (email collision with
  //                    a different provider), and Configuration
  //                    (server-side OAuth misconfig). We mirror the
  //                    success-banner shape with a red error banner
  //                    so the founder sees WHY the sign-in didn't
  //                    complete instead of staring at an empty form.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const accountDeleted = params.deleted === '1';
  const errorCodeRaw = params.error;
  const errorCode = typeof errorCodeRaw === 'string' ? errorCodeRaw : null;
  return <SignInClient accountDeleted={accountDeleted} errorCode={errorCode} />;
}
