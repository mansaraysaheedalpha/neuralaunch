"use client";

import { signIn } from "next-auth/react";
import { motion } from "motion/react";
import { ArrowLeft, Shield } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { FaGithub } from "react-icons/fa";
import Link from "next/link";
import Image from "next/image";

export default function SignInPage() {
  const handleSignIn = (provider: "google" | "github") => {
    void signIn(provider, { callbackUrl: "/" });
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy-950 p-4 text-slate-50">
      {/* Subtle radial glow — decorative only, matches landing page */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[500px] max-w-3xl bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.12),_transparent_60%)]"
      />

      {/* Back to home */}
      <Link
        href="/"
        className="absolute left-6 top-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Brand mark */}
        <div className="mb-10 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="mb-6 inline-flex items-center justify-center"
          >
            <Image
              src="/neuralaunch_logo.svg"
              alt=""
              width={64}
              height={48}
              priority
              className="h-12 w-auto"
            />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.5 }}
            className="text-3xl font-semibold tracking-tight text-white"
          >
            Welcome to NeuraLaunch
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="mt-3 text-sm text-slate-300"
          >
            Sign in to start your discovery.
          </motion.p>
        </div>

        {/* Sign-in card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="rounded-xl border border-slate-800 bg-navy-900 p-6 shadow-xl sm:p-8"
        >
          <div className="space-y-3">
            {/* Google */}
            <button
              type="button"
              onClick={() => handleSignIn("google")}
              className="group inline-flex w-full items-center justify-center gap-3 rounded-md border border-slate-700 bg-navy-800 px-6 py-3 text-sm font-medium text-white transition-colors hover:border-slate-600 hover:bg-navy-800/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
            >
              <FcGoogle className="h-5 w-5" aria-hidden="true" />
              <span>Continue with Google</span>
            </button>

            {/* GitHub */}
            <button
              type="button"
              onClick={() => handleSignIn("github")}
              className="group inline-flex w-full items-center justify-center gap-3 rounded-md border border-slate-700 bg-navy-800 px-6 py-3 text-sm font-medium text-white transition-colors hover:border-slate-600 hover:bg-navy-800/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900"
            >
              <FaGithub className="h-5 w-5" aria-hidden="true" />
              <span>Continue with GitHub</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-navy-900 px-3 text-slate-300">
                Secure authentication
              </span>
            </div>
          </div>

          {/* Trust note */}
          <div className="flex items-center justify-center gap-2 text-xs text-slate-300">
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Your data is protected and never shared.</span>
          </div>
        </motion.div>

        {/* Legal footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-6 text-center text-xs text-slate-300"
        >
          By continuing, you agree to our{" "}
          <Link
            href="/legal/terms"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/legal/privacy"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </motion.p>
      </motion.div>
    </div>
  );
}
