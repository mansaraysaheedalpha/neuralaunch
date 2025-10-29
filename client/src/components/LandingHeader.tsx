// src/components/LandingHeader.tsx
"use client";

import Link from "next/link";
import ThemeSwitcher from "./ThemeSwitcher";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";
import { motion } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export default function LandingHeader() {
  const { data: session, status } = useSession();
  const FEEDBACK_FORM_URL = "https://forms.gle/WVLZzKtFYLvb7Xkg9"; // Feedback URL

  return (
    // Fixed positioning for the landing page header
    <header className="fixed top-0 left-0 right-0 z-50 p-4 sm:px-6 lg:px-8 py-5 bg-background/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-border/50">
      <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo and Title Section */}
        <Link href="/" className="flex items-center space-x-3 group">
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
          <div className="hidden sm:block">
            {" "}
            {/* Hide text on very small screens */}
            <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              NeuraLaunch
            </h1>
            <p className="text-xs text-muted-foreground">AI Startup Co-Pilot</p>
          </div>
        </Link>

        {/* Navigation Links and Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* About Us Link */}
          <Link
            href="/about"
            className="hidden md:inline-flex items-center px-3 py-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            About Us
          </Link>
          {/* FAQ Link */}
          <Link
            href="/faq"
            className="hidden md:inline-flex items-center px-3 py-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            FAQ
          </Link>
          {/* Feedback Button */}
          <Link
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-foreground bg-muted hover:bg-border rounded-full transition-colors" // Adjusted style
          >
            <span>Feedback</span>
            <span>💬</span>
          </Link>
          <ThemeSwitcher />
          {/* Auth Status Logic */}
          {status === "loading" ? (
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-muted rounded-full animate-pulse"></div>
          ) : session ? (
            // User Menu Dropdown
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
                  {/* Link to Go to App */}
                  <DropdownMenu.Item asChild>
                    <Link
                      href="/generate"
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
                    onSelect={() => void signOut()} // Sign out
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
            <Link href="/signin" passHref>
              <motion.button
                whileHover={{
                  scale: 1.05,
                  boxShadow: "0 10px 25px -5px rgba(139, 92, 246, 0.3)",
                }}
                whileTap={{ scale: 0.95 }}
                className="relative inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-primary via-violet-600 to-secondary rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group"
              >
                <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-secondary via-violet-600 to-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative z-10">Get Started</span>
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
                  className="relative z-10 group-hover:translate-x-1 transition-transform"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </motion.button>
            </Link>
          )}
          {/* END Auth Status Logic */}
        </div>
      </div>
    </header>
  );
}
