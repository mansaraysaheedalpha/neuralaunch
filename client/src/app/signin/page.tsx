// src/app/signin/page.tsx
//
// Server-component wrapper for the sign-in surface. Reads the
// LinkedIn env flag at request time and passes it down to the
// interactive client component, which gates the LinkedIn provider
// button so it only renders when the OAuth credentials are
// actually configured. Keeps the env access on the server (the
// LINKEDIN_CLIENT_ID is not a public secret but it doesn't need to
// reach the browser bundle either).

import type { Metadata } from "next";
import { env } from "@/lib/env";
import SignInClient from "./SignInClient";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to NeuraLaunch — one honest interview, one clear recommendation, a roadmap built around you.",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  const linkedInEnabled = Boolean(
    env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET
  );
  return <SignInClient linkedInEnabled={linkedInEnabled} />;
}
