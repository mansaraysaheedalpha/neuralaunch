"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import LoginButton from "./LoginButton";

export default function Header() {
  const router = useRouter();

  const handleNewChat = () => {
    // We'll add logic here to clear the chat state
    // For now, it just navigates home
    router.push("/");
  };

  return (
    <header className="pt-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          {/* Logo and App Name */}
          <Link href="/" className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center shadow-glow">
                <svg
                  className="w-7 h-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-pink-500 rounded-full animate-pulse"></div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gradient">IdeaSpark</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                AI-Powered Startup Ideas
              </p>
            </div>
          </Link>

          {/* Action Buttons */}
          <div className="flex items-center gap-4">
            
            <LoginButton />
          </div>
        </div>
      </div>
    </header>
  );
}
