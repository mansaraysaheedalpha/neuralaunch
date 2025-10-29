// src/components/ConnectVercelButton.tsx
"use client";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";

// Vercel Icon
const VercelIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 75 65">
    <path d="M37.59.25l36.95 64H.64l36.95-64z"></path>
  </svg>
);

export default function ConnectVercelButton() {
  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => void signIn("vercel")}
      className="group relative inline-flex items-center justify-center gap-3 px-6 py-3 bg-black dark:bg-white border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-700 rounded-xl font-medium text-white dark:text-black transition-all duration-300 overflow-hidden shadow-lg hover:shadow-xl mt-2"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-white/10 dark:from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <VercelIcon />
      <span className="relative z-10">Connect Vercel Account</span>
    </motion.button>
  );
}
