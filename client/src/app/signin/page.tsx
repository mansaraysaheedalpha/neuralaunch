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
  // Next 15+ async searchParams. The DangerZone delete flow redirects
  // here with `?deleted=1` so the founder gets an explicit confirmation
  // banner instead of silently bouncing back to the signin form.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const accountDeleted = params.deleted === '1';
  return <SignInClient accountDeleted={accountDeleted} />;
}
