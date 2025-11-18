"use client";
import { signIn, signOut, useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

const GitHubIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 16 16">
    <path
      fill="currentColor"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
    />
  </svg>
);

export default function ConnectGitHubButton() {
  const { data: session } = useSession();
  const [isConnecting, setIsConnecting] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      // To link GitHub account, we need to sign out first, then sign in with GitHub
      // This allows NextAuth's allowDangerousEmailAccountLinking to work
      await signOut({ redirect: false });
      await signIn("github", { callbackUrl: "/profile" });
    } catch (error) {
      console.error("Failed to connect GitHub:", error);
      setIsConnecting(false);
      setShowWarning(true);
    }
  };

  return (
    <div className="space-y-3">
      {showWarning && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
          <p className="text-yellow-900 dark:text-yellow-200">
            Failed to connect GitHub. Please try again or contact support if the issue persists.
          </p>
        </div>
      )}
      <motion.button
        whileHover={{ scale: isConnecting ? 1 : 1.02, y: isConnecting ? 0 : -2 }}
        whileTap={{ scale: isConnecting ? 1 : 0.98 }}
        onClick={handleConnect}
        disabled={isConnecting}
        className="group relative inline-flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-gray-900 to-gray-800 dark:from-gray-700 dark:to-gray-600 border-2 border-transparent hover:border-gray-600 rounded-xl font-medium text-white transition-all duration-300 overflow-hidden shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {isConnecting ? (
          <Loader2 className="w-5 h-5 animate-spin relative z-10" />
        ) : (
          <GitHubIcon />
        )}
        <span className="relative z-10">
          {isConnecting ? "Connecting..." : "Connect GitHub Account"}
        </span>
      </motion.button>
      <p className="text-xs text-muted-foreground">
        You'll be signed out briefly to connect your GitHub account. You'll be signed back in automatically.
      </p>
    </div>
  );
}
