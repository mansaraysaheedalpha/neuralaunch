// src/components/LandingHeader.tsx
"use client";

import Link from "next/link";
import ThemeSwitcher from "./ThemeSwitcher"; // Assuming ThemeSwitcher is in components/
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import { motion } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import LoginButton from "./LoginButton"; // Assuming LoginButton is in components/

export default function LandingHeader() {
  const { data: session, status } = useSession();

  return (
    // Updated styling: absolute positioning, padding, z-index
    <header className="fixed top-0 left-0 right-0 z-50 p-4 sm:px-6 lg:px-8 py-5 bg-background/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-border/50">
      <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo and Title Section (Adapted from your previous Header) */}
        <Link href="/" className="flex items-center space-x-3 group">
          {/* Logo Icon using your PNG */}
          <div className="relative">
            <motion.div // Added motion for subtle hover effect
              whileHover={{ scale: 1.05, rotate: -3 }}
              className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-primary to-secondary rounded-lg sm:rounded-xl flex items-center justify-center transition-all duration-300 group-hover:shadow-lg group-hover:shadow-primary/30 p-1" // Added padding for image
            >
              <Image
                src="/neuralaunch_logo.png" // Your logo file in /public
                alt="NeuraLaunch Logo"
                width={48} // Intrinsic width
                height={48} // Intrinsic height
                className="object-contain" // Use contain to prevent distortion
              />
            </motion.div>
          </div>
          {/* Text */}
          <div className="hidden sm:block">
            {" "}
            {/* Hide text on very small screens */}
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              NeuraLaunch
            </h1>
            <p className="text-xs text-muted-foreground">AI Startup Co-Pilot</p>
          </div>
        </Link>

        {/* Action Buttons - Right side (Adapted) */}
        <div className="flex items-center gap-3 sm:gap-4">
          <ThemeSwitcher />
          {status === "loading" ? (
            <div className="w-10 h-10 bg-muted rounded-full animate-pulse"></div>
          ) : session ? (
            // User Menu Dropdown (Copied from your previous Header)
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <motion.button // Added motion
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden border-2 border-border hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  aria-label="User menu"
                >
                  {session.user?.image ? (
                    <Image
                      src={session.user.image}
                      alt={session.user.name || "User"}
                      width={40}
                      height={40}
                      className="object-cover"
                    />
                  ) : (
                    // Fallback icon
                    <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                      {/* Simple User Icon */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                  )}
                </motion.button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-50 p-1 text-sm text-foreground"
                  sideOffset={5}
                  align="end"
                >
                  <DropdownMenu.Label className="px-3 py-2 text-xs text-muted-foreground truncate">
                    {session.user?.name || session.user?.email}
                  </DropdownMenu.Label>
                  <DropdownMenu.Separator className="h-px bg-border my-1" />
                  {/* Link to the app/generate page */}
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/generate" // Link to the main app/generator page
                      className="flex items-center gap-2 px-3 py-2 rounded hover:bg-muted cursor-pointer outline-none select-none"
                    >
                      {/* Rocket Icon */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.3.05-3.14S5.24 15.66 4.5 16.5z" />
                        <path d="M17.5 7.5c1.5-1.26 2-5 2-5s-3.74.5-5 2c-.71.84-.7 2.3-.05 3.14S16.76 8.34 17.5 7.5z" />
                        <path d="M14.5 4.5c1.26 1.5 5 2 5 2s-.5 3.74-2 5c-.84.71-2.3.7-3.14-.05s-.8-2.43.05-3.14z" />
                        <path d="M9.5 19.5c-1.26-1.5-5-2-5-2s.5-3.74 2-5c.84-.71 2.3-.7 3.14.05s.8 2.43-.05 3.14z" />
                        <path d="M12 10.5a1.5 1.5 0 0 0-1.5 1.5v1a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-1a1.5 1.5 0 0 0-1.5-1.5h-1z" />
                      </svg>
                      Go to App
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-px bg-border my-1" />
                  <DropdownMenu.Item
                    onSelect={() => void signOut()} // Sign out stays the same
                    className="flex items-center gap-2 px-3 py-2 rounded hover:bg-muted cursor-pointer outline-none select-none text-red-500 hover:text-red-600"
                  >
                    {/* Sign Out Icon */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign Out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            // Use the LoginButton component for consistency if unauthenticated
            <LoginButton />
            // Or use the styled link if preferred:
            // <Link
            //   href="/api/auth/signin"
            //   className="px-5 py-2.5 text-sm font-semibold border border-foreground/30 rounded-lg text-foreground bg-background/50 hover:bg-foreground/5 dark:border-white/30 dark:text-white dark:bg-slate-900/50 dark:hover:bg-white/5 transition-colors duration-200 shadow-sm whitespace-nowrap"
            // >
            //   Sign In with Google
            // </Link>
          )}
        </div>
      </div>
    </header>
  );
}
