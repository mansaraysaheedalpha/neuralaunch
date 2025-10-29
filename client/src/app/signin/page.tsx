"use client";

import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react"; // Or your preferred icons
// Import Google and GitHub icons if you have them, e.g., from react-icons
import { FcGoogle } from "react-icons/fc";
import { FaGithub } from "react-icons/fa";

// Simple SVG Icons as placeholders
// const GoogleIcon = () => (
//   <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
//     <path
//       fill="#4285F4"
//       d="M21.35 11.1h-9.8v3.8h5.5c-.3 1.2-1.3 2.2-2.7 2.2s-2.7-.9-2.7-2.2.9-2.2 2.7-2.2c.6 0 1.1.1 1.6.4l2.8-2.8C18.3 3.9 15.3 3 12 3c-4.9 0-9 4.1-9 9s4.1 9 9 9c5.1 0 8.5-3.6 8.5-8.8 0-.6-.1-1.1-.2-1.6z"
//     />
//   </svg>
// );


export default function SignInPage() {
  const handleSignIn = (provider: "google" | "github") => {
    // Redirects to provider, then back to the page the user was originally on, or home page.
    void signIn(provider, { callbackUrl: "/" });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background via-violet-50/10 to-purple-50/10 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/50 p-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md p-8 bg-card border border-border rounded-2xl shadow-xl text-center"
      >
        <Lock className="w-12 h-12 text-primary mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">
          Sign In / Sign Up
        </h1>
        <p className="text-muted-foreground mb-8">
          Connect to save your blueprints and unlock the full power of
          NeuraLaunch.
        </p>

        <div className="space-y-4">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSignIn("google")}
            className="w-full inline-flex items-center justify-center px-6 py-3 bg-white dark:bg-gray-800 border border-border rounded-lg font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all"
          >
            <FcGoogle />
            Continue with Google
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSignIn("github")}
            className="w-full inline-flex items-center justify-center px-6 py-3 bg-gray-900 dark:bg-gray-700 border border-transparent rounded-lg font-medium text-white hover:bg-gray-800 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all"
          >
            <FaGithub />
            Continue with GitHub
          </motion.button>
        </div>

        <p className="text-xs text-muted-foreground mt-8">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}
