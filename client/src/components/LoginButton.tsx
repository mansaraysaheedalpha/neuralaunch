// client/src/components/LoginButton.tsx
"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";

export default function LoginButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
    );
  }

  if (session) {
    return (
      <div className="flex items-center gap-3">
        {session.user?.image && (
          <Image
            src={session.user.image}
            alt={session.user.name || "User Avatar"}
            width={40}
            height={40}
            className="rounded-full ring-2 ring-violet-100 dark:ring-violet-900/30"
          />
        )}
        <button
          onClick={() => void signOut()}
          className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-violet-600 dark:hover:text-violet-400 transition-colors duration-200"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => void signIn("google")}
      className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 rounded-xl hover:from-violet-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
    >
      Sign In with Google
    </button>
  );
}
