"use client";
// src/app/signin/SignInClient.tsx
//
// The interactive surface of the sign-in page. Receives a
// `linkedInEnabled` flag from the server-component wrapper so it
// can hide the LinkedIn provider button when the LinkedIn OAuth
// vars aren't configured (dev / staging environments without a
// LinkedIn app set up). Reading the env directly here would force
// the page to be a server component; instead we keep the
// interactive surface as a client component and let the parent
// pass the flag.

import { signIn } from "next-auth/react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Lock, Compass, ArrowRight, ChevronRight } from "lucide-react";
import { FaGithub, FaLinkedin } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";
import Link from "next/link";
import Image from "next/image";

type Provider = "google" | "linkedin" | "github";

export default function SignInClient() {
  const reduce = useReducedMotion();

  const handleSignIn = (provider: Provider) => {
    void signIn(provider, { callbackUrl: "/" });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-navy-950 text-slate-50">
      {/* Decorative backdrop — same primary radial glow + masked
          geometric grid we ship on /discovery and /recommendation
          and /roadmap so a paying user moves between surfaces
          without a brand discontinuity. The glow is biased to the
          right (where the sign-in card sits) so the card feels lit. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute right-0 top-0 h-[700px] w-[80%] bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--primary)/0.18),_hsl(var(--primary)/0.04)_55%,transparent_80%)]" />
        <div className="absolute left-0 bottom-0 h-[420px] w-[55%] bg-[radial-gradient(ellipse_at_bottom_left,_hsl(var(--gold)/0.05),_transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,hsl(var(--border)/0.55)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.55)_1px,transparent_1px)] [background-size:42px_42px] [mask-image:radial-gradient(ellipse_at_center,black_45%,transparent_88%)]" />
      </div>

      {/* Back to home — top-left corner. On mobile, sits in its own
          row above the brand panel content so it doesn't visually
          collide with the wordmark (both were anchored top-left at
          sm and overlapped on a 320-375px viewport). */}
      <Link
        href="/"
        className="absolute left-4 top-4 sm:left-6 sm:top-6 z-20 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs sm:text-sm font-medium text-slate-400 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        Back to home
      </Link>

      {/* Two-column composition. Brand panel on the left (lg+),
          sign-in card on the right. Below lg, the brand panel
          collapses into a tighter header above the card. */}
      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 items-start gap-10 px-5 pt-20 pb-12 sm:px-8 sm:gap-12 lg:grid-cols-12 lg:items-center lg:gap-16 lg:px-12 lg:py-0">
        <BrandPanel reduce={reduce} />
        <SignInCard
          reduce={reduce}
          onSignIn={handleSignIn}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Brand panel — left column at lg+, header at md/sm                */
/* ---------------------------------------------------------------- */

function BrandPanel({ reduce }: { reduce: boolean | null }) {
  const fade = (delay: number) =>
    reduce
      ? { initial: false, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.45, ease: "easeOut" as const },
        };

  return (
    <div className="lg:col-span-5 flex flex-col gap-8 lg:gap-10">
      {/* Wordmark — links back to /home */}
      <motion.div {...fade(0.05)}>
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 rounded-md py-1 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="NeuraLaunch home"
        >
          <Image
            src="/neuralaunch_logo.svg"
            alt=""
            width={40}
            height={32}
            priority
            className="h-8 w-auto"
          />
          <span className="text-lg font-semibold tracking-tight text-white">
            NeuraLaunch
          </span>
        </Link>
      </motion.div>

      <div className="flex flex-col gap-5 max-w-md">
        <motion.span
          {...fade(0.10)}
          className="inline-flex items-center gap-1.5 self-start rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold"
        >
          <Compass className="size-3" aria-hidden="true" />
          From lost to launched
        </motion.span>

        <motion.h1
          {...fade(0.16)}
          className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight leading-[1.15]"
        >
          One honest interview.{" "}
          <span className="text-gold">One clear recommendation.</span>
        </motion.h1>

        <motion.p
          {...fade(0.22)}
          className="text-sm text-slate-300 leading-relaxed"
        >
          We interview your situation, commit to one direction with the
          reasoning laid bare, then walk every task with you until you&rsquo;ve
          shipped, learned, or decided what comes next.
        </motion.p>
      </div>

      {/* 3-stage rhythm — Discovery · Roadmap · Outcome */}
      <motion.div
        {...fade(0.30)}
        className="hidden lg:flex flex-col gap-3"
      >
        <div className="flex items-center gap-3">
          <RhythmTile color="primary" />
          <div className="h-px w-8 bg-gradient-to-r from-primary/40 to-gold/40" />
          <RhythmTile color="gold" />
          <div className="h-px w-8 bg-gradient-to-r from-gold/40 to-success/40" />
          <RhythmTile color="success" />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Discovery · Roadmap · Outcome
        </p>
      </motion.div>

      {/* Founder testimonial — only at lg+ to save mobile vertical
          real estate without losing the message. */}
      <motion.div
        {...fade(0.36)}
        className="hidden lg:flex flex-col gap-2 mt-auto pt-8"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
          Why founders choose this
        </p>
        <p className="text-[13px] italic text-slate-300 leading-relaxed max-w-md">
          &ldquo;It commits to one direction. No menu. No wishy-washy options.
          That&rsquo;s what stuck founders actually need.&rdquo;
        </p>
        <p className="text-[11px] text-slate-500">
          — founder using NeuraLaunch since Apr 2026
        </p>
      </motion.div>
    </div>
  );
}

function RhythmTile({ color }: { color: "primary" | "gold" | "success" }) {
  const styles =
    color === "primary"
      ? "border-primary/40 bg-primary/10"
      : color === "gold"
        ? "border-gold/40 bg-gold/10"
        : "border-success/40 bg-success/10";
  const dot =
    color === "primary"
      ? "bg-primary"
      : color === "gold"
        ? "bg-gold"
        : "bg-success";
  return (
    <span className={`flex size-8 items-center justify-center rounded-md border ${styles}`} aria-hidden="true">
      <span className={`size-1.5 rounded-full ${dot}`} />
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Sign-in card — right column at lg+, full-width below             */
/* ---------------------------------------------------------------- */

function SignInCard({
  reduce,
  onSignIn,
}: {
  reduce:           boolean | null;
  onSignIn:         (provider: Provider) => void;
}) {
  const fade = (delay: number) =>
    reduce
      ? { initial: false, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.45, ease: "easeOut" as const },
        };

  return (
    <motion.div
      {...fade(0.20)}
      className="lg:col-span-7 lg:justify-self-end w-full max-w-[460px] mx-auto lg:mx-0"
    >
      <div className="rounded-xl border border-slate-800 bg-navy-900 px-7 py-9 sm:px-8 sm:py-10 shadow-2xl shadow-black/30">
        {/* Eyebrow + headline */}
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
          Sign in or create your account
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Continue your discovery
        </h2>
        <p className="mt-2 text-[13px] text-slate-400 leading-relaxed max-w-[340px]">
          Pick the account you&rsquo;ll use to come back. We&rsquo;ll never post
          on your behalf or share your data.
        </p>

        {/* Provider stack */}
        <div className="mt-7 flex flex-col gap-2.5">
          <ProviderButton
            label="Continue with Google"
            icon={<FcGoogle className="size-4" />}
            onClick={() => onSignIn("google")}
          />
          <ProviderButton
            label="Continue with LinkedIn"
            icon={<FaLinkedin className="size-4 text-[#0A66C2]" />}
            onClick={() => onSignIn("linkedin")}
          />
          <ProviderButton
            label="Continue with GitHub"
            icon={<FaGithub className="size-4 text-white" />}
            onClick={() => onSignIn("github")}
          />
        </div>

        {/* Trust line — single 11px row with lock icon. Replaces the
            prior dedicated "Secure authentication" divider that
            competed with the providers for visual weight. */}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <Lock className="size-3" aria-hidden="true" />
          Encrypted in transit. Your data stays yours.
        </p>

        {/* Legal footer */}
        <div className="mt-7 border-t border-slate-800/70 pt-5">
          <p className="text-center text-[11px] text-slate-500 leading-relaxed">
            By continuing, you agree to our{" "}
            <Link
              href="/legal/terms"
              className="text-slate-400 underline-offset-2 hover:text-slate-300 hover:underline"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/legal/privacy"
              className="text-slate-400 underline-offset-2 hover:text-slate-300 hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Sub-card return-user reminder */}
      <p className="mt-5 text-center text-[11px] text-slate-500">
        Already have an account? Just continue with the same provider —
        we&rsquo;ll recognise you.{" "}
        <ArrowRight className="inline size-3 text-slate-500" aria-hidden="true" />
      </p>
    </motion.div>
  );
}

function ProviderButton({
  label,
  icon,
  onClick,
}: {
  label:   string;
  icon:    React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-slate-800 bg-navy-950 px-4 text-sm font-medium text-foreground/90 transition-all hover:bg-navy-800 hover:border-slate-700 hover:text-foreground hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
    >
      <span className="flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </span>
      <ChevronRight
        className="absolute right-3 size-4 text-slate-600 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
      />
    </button>
  );
}
