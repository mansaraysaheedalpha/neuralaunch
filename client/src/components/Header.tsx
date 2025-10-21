//src/components/Header.tsx
"use client";

import Link from "next/link";
import LoginButton from "./LoginButton";
import ThemeSwitcher from "./ThemeSwitcher";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image"; // Import the Next.js Image component
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"; // Import Radix Dropdown

export default function Header({
  setMobileMenuOpen,
}: {
  setMobileMenuOpen: (isOpen: boolean) => void;
}) {
  const { data: session, status } = useSession();

  return (
    <header className="flex h-20 items-center border-b border-border px-4 sm:px-6 lg:px-8 flex-shrink-0">
      <div className="w-full max-w-7xl mx-auto flex items-center">
        <div className="flex items-center gap-4">
          {/* Hamburger Menu Button - Mobile Only */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 -ml-2 rounded-lg hover:bg-muted"
            aria-label="Open menu"
          >
            {/* Hamburger SVG */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" x2="20" y1="12" />
              <line x1="4" x2="20" y1="6" />
              <line x1="4" x2="20" y1="18" />
            </svg>
          </button>

          {/* Logo and Title */}
          <div className="hidden sm:flex group">
            <Link href="/" className="flex items-center space-x-3">
              {/* Logo Icon */}
              <div className="relative">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center transition-all duration-300 group-hover:shadow-lg group-hover:shadow-primary/30">
                  <svg
                    className="w-7 h-7 text-white transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12"
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
              </div>
              {/* Text */}
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  IdeaSpark
                </h1>
                <p className="text-xs text-muted-foreground">
                  AI-Powered Startup Ideas
                </p>
              </div>
            </Link>
          </div>
        </div>

        {/* Action Buttons - UPDATED LOGIC with Dropdown */}
        <div className="flex items-center gap-4 ml-auto">
          <ThemeSwitcher />
          {status === "loading" ? (
            <div className="w-10 h-10 bg-muted rounded-full animate-pulse"></div>
          ) : session ? (
            // ================= THIS IS THE NEW USER MENU =================
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="w-10 h-10 rounded-full overflow-hidden border-2 border-border hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
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
                    // Fallback icon if no image
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
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="mt-2 w-48 bg-card border border-border rounded-lg shadow-lg z-50 p-1 text-sm text-foreground"
                  sideOffset={5}
                  align="end"
                >
                  <DropdownMenu.Label className="px-3 py-2 text-xs text-muted-foreground">
                    {session.user?.name || session.user?.email}
                  </DropdownMenu.Label>
                  <DropdownMenu.Separator className="h-px bg-border my-1" />

                  <DropdownMenu.Item asChild>
                    <Link
                      href="/profile"
                      className="flex items-center gap-2 px-3 py-2 rounded hover:bg-muted cursor-pointer outline-none select-none"
                    >
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
                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                        <path d="M4 22h16" />
                        <path d="M10 14.66V17h4v-2.34" />
                        <path d="M8.5 12.5a2.5 2.5 0 0 1 5 0V14H8.5Z" />
                        <path d="M12 12v-2.5" />
                        <path d="M10.5 17v-2.5" />
                      </svg>
                      My Awards
                    </Link>
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className="h-px bg-border my-1" />

                  <DropdownMenu.Item
                    onSelect={() => void signOut()}
                    className="flex items-center gap-2 px-3 py-2 rounded hover:bg-muted cursor-pointer outline-none select-none text-red-500 hover:text-red-600"
                  >
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
            // =============================================================
            <LoginButton />
          )}
        </div>
      </div>
    </header>
  );
}
