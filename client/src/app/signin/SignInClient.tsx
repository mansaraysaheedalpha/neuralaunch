"use client";
// src/app/signin/SignInClient.tsx
//
// Institute treatment of the sign-in page. Two-column full-viewport
// layout: a black editorial canvas on the left, the auth form on the
// right. All NextAuth provider wiring is preserved — only the render
// changed.

import { signIn } from "next-auth/react";
import { ChevronRight, AlertTriangle, Check } from "lucide-react";
import { FaGithub, FaLinkedin } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import Link from "next/link";

type Provider = "google" | "linkedin" | "github";

const AUTH_ERROR_COPY: Record<string, { title: string; detail: string }> = {
  AccessDenied: {
    title: "Sign-in was rejected",
    detail:
      "Your GitHub email is not a verified primary email on GitHub. " +
      "Verify it in GitHub Settings → Emails, then try signing in again. " +
      "You can also sign in with Google instead.",
  },
  Verification: {
    title: "Verification link expired",
    detail: "The magic link has expired. Sign in again to receive a new one.",
  },
  OAuthAccountNotLinked: {
    title: "Account already exists",
    detail:
      "An account with this email already exists, signed in via a different provider. " +
      "Sign in with the original provider, then connect other accounts in Settings.",
  },
  Configuration: {
    title: "Authentication is misconfigured",
    detail:
      "Something is wrong on our end. Please try again, or contact support if it persists.",
  },
  OAuthCallback: {
    title: "Provider sign-in failed",
    detail: "The OAuth provider rejected the sign-in. Please try again.",
  },
  OAuthSignin: {
    title: "Provider sign-in failed",
    detail: "Could not start the OAuth flow. Please try again.",
  },
  CallbackRouteError: {
    title: "Sign-in callback failed",
    detail:
      "Something went wrong processing the provider response. Please try again.",
  },
};

const FALLBACK_AUTH_ERROR = {
  title:  "Sign-in did not complete",
  detail:
    "Something went wrong. Please try again, or contact support if it persists.",
};

function resolveAuthError(
  code: string | null,
): { title: string; detail: string } | null {
  if (!code) return null;
  return AUTH_ERROR_COPY[code] ?? FALLBACK_AUTH_ERROR;
}

interface SignInClientProps {
  /** True when the page was reached via the account-deletion redirect. */
  accountDeleted?: boolean;
  /** NextAuth error code from `?error=<code>`. */
  errorCode?: string | null;
}

export default function SignInClient({
  accountDeleted = false,
  errorCode = null,
}: SignInClientProps) {
  const authError = resolveAuthError(errorCode);

  const handleSignIn = (provider: Provider) => {
    void signIn(provider, { callbackUrl: "/" });
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg text-fg lg:grid-cols-[3fr_2fr]">
      {/* Left — editorial canvas */}
      <LeftCanvas />

      {/* Right — auth form */}
      <RightForm
        authError={authError}
        accountDeleted={accountDeleted}
        onSignIn={handleSignIn}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Left — editorial canvas                                                   */
/* -------------------------------------------------------------------------- */

function LeftCanvas() {
  return (
    <section className="relative hidden flex-col justify-between border-r border-rule px-10 py-14 lg:flex lg:px-16 lg:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(700px 320px at 20% 30%, rgba(255,90,60,0.10), transparent 60%)",
        }}
      />
      {/* Brand mark — top */}
      <Link
        href="/"
        aria-label="NeuraLaunch home"
        className="relative inline-flex items-center gap-3.5 font-mono text-[11px] uppercase tracking-[0.14em] text-fg"
      >
        <span
          aria-hidden="true"
          className="relative inline-block size-[18px] rounded-full bg-accent"
        >
          <span className="absolute inset-[5px] rounded-full bg-bg" />
        </span>
        NeuraLaunch
      </Link>

      {/* Centred welcome */}
      <div className="relative max-w-[640px]">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
          Sign in · continue
        </p>
        <h1 className="mt-7 font-serif text-fg [font-size:clamp(56px,7.4vw,108px)] [font-style:italic] [font-weight:400] [line-height:1] [letter-spacing:-0.025em]">
          Welcome back,<br />founder.
        </h1>
        <p className="mt-9 max-w-[480px] text-[17px] leading-[1.5] text-fg-2">
          Your sessions, recommendations, and roadmaps are right where you left
          them. Pick the account you signed in with and the engine picks up
          mid-conversation.
        </p>

        {/* Last cycle memo — placeholder structure for future session-continuity wiring. */}
        <div className="mt-12 grid gap-2.5 border-l border-rule pl-6 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          <span>Last cycle · in flight</span>
          <span>Recommendation · cycle I</span>
          <span className="text-accent">Pick up where you left off</span>
        </div>
      </div>

      {/* Pull-quote — short founder testimonial */}
      <blockquote className="relative max-w-[480px] border-l-2 border-accent pl-5 font-serif text-[18px] italic leading-[1.45] text-fg-2">
        &ldquo;It commits to one direction. No menu. No wishy-washy options. That&rsquo;s what
        stuck founders actually need.&rdquo;
        <cite className="mt-3 block font-mono text-[10px] not-italic uppercase tracking-[0.14em] text-muted">
          — founder using NeuraLaunch since Apr 2026
        </cite>
      </blockquote>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Right — auth form                                                         */
/* -------------------------------------------------------------------------- */

function RightForm({
  authError,
  accountDeleted,
  onSignIn,
}: {
  authError: { title: string; detail: string } | null;
  accountDeleted: boolean;
  onSignIn: (provider: Provider) => void;
}) {
  return (
    <section className="flex flex-col justify-between bg-bg-2 px-7 py-14 sm:px-12 lg:py-20">
      {/* Mobile-only brand mark */}
      <Link
        href="/"
        aria-label="NeuraLaunch home"
        className="inline-flex items-center gap-3.5 font-mono text-[11px] uppercase tracking-[0.14em] text-fg lg:hidden"
      >
        <span
          aria-hidden="true"
          className="relative inline-block size-[18px] rounded-full bg-accent"
        >
          <span className="absolute inset-[5px] rounded-full bg-bg" />
        </span>
        NeuraLaunch
      </Link>

      <div className="mx-auto w-full max-w-[420px] lg:mx-0">
        {authError && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-6 border border-amber px-5 py-4"
          >
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-amber">
              <AlertTriangle aria-hidden="true" className="size-3.5" />
              {authError.title}
            </p>
            <p className="mt-2 text-[13px] leading-[1.55] text-fg-2">
              {authError.detail}
            </p>
          </div>
        )}

        {accountDeleted && (
          <div
            role="status"
            aria-live="polite"
            className="mb-6 border border-success px-5 py-4"
          >
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-success">
              <Check aria-hidden="true" className="size-3.5" />
              Account deleted
            </p>
            <p className="mt-2 text-[13px] leading-[1.55] text-fg-2">
              Your NeuraLaunch account and any active Paddle subscription have
              been cancelled. You won&rsquo;t be charged again.
            </p>
          </div>
        )}

        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          Pick your provider
        </p>
        <h2 className="mt-3 font-sans text-[28px] font-medium leading-[1.1] tracking-[-0.015em] text-fg">
          Continue your discovery.
        </h2>
        <p className="mt-3 max-w-[360px] text-[14px] leading-[1.5] text-fg-2">
          We&rsquo;ll never post on your behalf or share your data.
        </p>

        <div className="mt-9 grid gap-2.5">
          <ProviderButton
            label="Continue with Google"
            icon={<FcGoogle className="size-[18px]" />}
            onClick={() => onSignIn("google")}
          />
          <ProviderButton
            label="Continue with LinkedIn"
            icon={<FaLinkedin className="size-[18px] text-[#0A66C2]" />}
            onClick={() => onSignIn("linkedin")}
          />
          <ProviderButton
            label="Continue with GitHub"
            icon={<FaGithub className="size-[18px] text-fg" />}
            onClick={() => onSignIn("github")}
          />
        </div>

        <p className="mt-9 max-w-[360px] font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Encrypted in transit · your data stays yours
        </p>
      </div>

      {/* Bottom legal */}
      <p className="mt-12 max-w-[420px] border border-rule px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted lg:mx-0">
        By signing in you agree to the{" "}
        <Link
          href="/legal/terms"
          className="text-fg transition-colors hover:text-accent"
        >
          Terms
        </Link>
        {" · "}
        <Link
          href="/legal/privacy"
          className="text-fg transition-colors hover:text-accent"
        >
          Privacy
        </Link>
        .
      </p>
    </section>
  );
}

function ProviderButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between border border-rule-strong bg-bg px-5 py-4 text-left font-sans text-[14px] font-medium text-fg transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:border-accent focus-visible:text-accent"
    >
      <span className="flex items-center gap-3.5">
        {icon}
        <span>{label}</span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 text-muted transition-colors group-hover:text-accent"
      />
    </button>
  );
}
