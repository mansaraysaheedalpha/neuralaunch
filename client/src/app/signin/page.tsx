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

export default function SignInPage() {
  return <SignInClient />;
}
