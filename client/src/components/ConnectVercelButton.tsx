// src/components/ConnectVercelButton.tsx
"use client";
import { signIn } from "next-auth/react";

// Placeholder Vercel Icon
const VercelIcon = () => (
  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 75 65">
    <path d="M37.59.25l36.95 64H.64l36.95-64z"></path>
  </svg>
);

export default function ConnectVercelButton() {
  return (
    <button
      onClick={() => signIn("vercel")} // Trigger Vercel OAuth flow
      className="mt-2 inline-flex items-center justify-center px-6 py-3 bg-black dark:bg-white border border-transparent rounded-lg font-medium text-white dark:text-black hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all"
    >
      <VercelIcon />
      Connect Vercel Account
    </button>
  );
}
