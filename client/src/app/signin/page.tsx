//src/app/signin/page.tsx
"use client";

import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Shield } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { FaGithub } from "react-icons/fa";
import Link from "next/link";

export default function SignInPage() {
  const handleSignIn = (provider: "google" | "github") => {
    void signIn(provider, { callbackUrl: "/" });
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background via-violet-50/10 to-purple-50/10 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/50 p-4 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" />
      </div>

      {/* Back to Home Link */}
      <Link
        href="/"
        className="absolute top-6 left-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowRight className="w-4 h-4 rotate-180" />
        Back to Home
      </Link>

      {/* Main Sign In Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo and Branding */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-2xl mb-4 shadow-lg"
          >
            <Sparkles className="w-8 h-8 text-white" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2"
          >
            Welcome to NeuraLaunch
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-muted-foreground"
          >
            Sign in to start building your validated startup
          </motion.p>
        </div>

        {/* Sign In Options Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="bg-card/80 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-8"
        >
          <div className="space-y-4">
            {/* Google Sign In */}
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSignIn("google")}
              className="group relative w-full flex items-center justify-center gap-3 px-6 py-4 bg-white dark:bg-slate-800 border-2 border-border hover:border-primary/50 rounded-xl font-medium text-foreground transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <FcGoogle className="w-5 h-5 relative z-10" />
              <span className="relative z-10">Continue with Google</span>
            </motion.button>

            {/* GitHub Sign In */}
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSignIn("github")}
              className="group relative w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-gray-900 to-gray-800 dark:from-gray-700 dark:to-gray-600 border-2 border-transparent hover:border-gray-600 rounded-xl font-medium text-white transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <FaGithub className="w-5 h-5 relative z-10" />
              <span className="relative z-10">Continue with GitHub</span>
            </motion.button>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-3 text-muted-foreground">
                Secure authentication
              </span>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-4 h-4" />
            <span>Your data is protected and secure</span>
          </div>
        </motion.div>

        {/* Terms and Privacy */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-xs text-center text-muted-foreground mt-6"
        >
          By continuing, you agree to our{" "}
          <Link href="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
}
