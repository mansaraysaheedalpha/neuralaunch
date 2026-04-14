"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import {
  Menu,
  X,
  ArrowRight,
  LayoutDashboard,
  Settings,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

/**
 * MarketingHeader — fixed top header for the landing page, about, faq,
 * and legal pages.
 *
 * Auth-aware CTAs:
 *  - Signed out: "Sign in" (secondary text link) + "Start Your Discovery →"
 *    (primary blue button). Mirrors the convention used by every serious
 *    B2B product site (Stripe, Linear, Vercel, Notion) — returning users
 *    see a clear entry point, newcomers see the primary action.
 *  - Signed in: avatar dropdown with Dashboard / Settings / Sign out.
 *    Never an "Open App" button (reads like a mobile app launcher).
 */
export default function MarketingHeader() {
  const { data: session, status } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAuthed = status === "authenticated" && !!session;
  const user = session?.user;
  const displayName =
    user?.name || user?.email?.split("@")[0] || "Account";
  const initials = (user?.name || user?.email || "U")
    .split(/[\s@]+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-slate-800 bg-[#070F1C]/90 backdrop-blur supports-[backdrop-filter]:bg-[#070F1C]/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
          aria-label="NeuraLaunch home"
        >
          <Image
            src="/neuralaunch_logo.svg"
            alt=""
            width={36}
            height={27}
            priority
            className="h-7 w-auto"
          />
          <span className="text-lg font-semibold tracking-tight text-white">
            NeuraLaunch
          </span>
        </Link>

        {/* Desktop nav */}
        <nav
          className="hidden items-center gap-8 md:flex"
          aria-label="Primary"
        >
          <Link
            href="/about"
            className="text-sm font-medium text-slate-400 transition-colors hover:text-white"
          >
            About
          </Link>
          <Link
            href="/#pricing"
            className="text-sm font-medium text-slate-400 transition-colors hover:text-white"
          >
            Pricing
          </Link>
        </nav>

        {/* Right-side actions */}
        <div className="hidden items-center gap-4 md:flex">
          {status === "loading" ? (
            // Skeleton placeholder to avoid layout shift while the session loads
            <div className="h-9 w-32 animate-pulse rounded-md bg-slate-800" />
          ) : isAuthed ? (
            <UserMenu
              displayName={displayName}
              email={user?.email ?? null}
              image={user?.image ?? null}
              initials={initials}
            />
          ) : (
            <>
              <Link
                href="/signin"
                className="text-sm font-medium text-slate-300 transition-colors hover:text-white focus:outline-none focus-visible:text-white"
              >
                Sign in
              </Link>
              <Link
                href="/discovery"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#070F1C]"
              >
                Start Your Discovery
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="inline-flex items-center justify-center rounded-md p-2 text-slate-300 hover:bg-slate-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] md:hidden"
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className="border-t border-slate-800 bg-[#070F1C] md:hidden"
        >
          <div className="space-y-1 px-4 py-4">
            <Link
              href="/about"
              className="block rounded-md px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              About
            </Link>
            <Link
              href="/#pricing"
              className="block rounded-md px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Pricing
            </Link>

            {isAuthed ? (
              <>
                <div className="my-2 border-t border-slate-800" />
                <div className="px-3 py-2 text-xs uppercase tracking-wider text-slate-500">
                  Signed in as{" "}
                  <span className="text-slate-300">{displayName}</span>
                </div>
                <Link
                  href="/discovery"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                  onClick={() => setMobileOpen(false)}
                >
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  Dashboard
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                  onClick={() => setMobileOpen(false)}
                >
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    void signOut();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/signin"
                  className="block rounded-md px-3 py-2 text-base font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                  onClick={() => setMobileOpen(false)}
                >
                  Sign in
                </Link>
                <Link
                  href="/discovery"
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#2563EB] px-4 py-2.5 text-base font-semibold text-white hover:bg-[#1D4ED8]"
                  onClick={() => setMobileOpen(false)}
                >
                  Start Your Discovery
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------
 * UserMenu — avatar dropdown for signed-in users
 * ------------------------------------------------------------------ */
function UserMenu({
  displayName,
  email,
  image,
  initials,
}: {
  displayName: string;
  email: string | null;
  image: string | null;
  initials: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-slate-800 p-0.5 pr-3 transition-colors hover:border-slate-700 hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#070F1C]"
          aria-label="Account menu"
        >
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#2563EB] text-xs font-semibold text-white">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </span>
          <span className="hidden max-w-[140px] truncate text-sm font-medium text-slate-200 sm:inline">
            {displayName}
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-lg border border-slate-800 bg-[#0A1628] p-1.5 shadow-xl"
        >
          <div className="flex items-center gap-3 px-2.5 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2563EB] text-xs font-semibold text-white">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {displayName}
              </p>
              {email && (
                <p className="truncate text-xs text-slate-400">{email}</p>
              )}
            </div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-800" />
          <DropdownMenu.Item asChild>
            <Link
              href="/discovery"
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-200 outline-none transition-colors hover:bg-slate-800 focus:bg-slate-800"
            >
              <LayoutDashboard className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Dashboard
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/profile"
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-200 outline-none transition-colors hover:bg-slate-800 focus:bg-slate-800"
            >
              <UserIcon className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Profile
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-200 outline-none transition-colors hover:bg-slate-800 focus:bg-slate-800"
            >
              <Settings className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-slate-800" />
          <DropdownMenu.Item
            onSelect={() => void signOut()}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-200 outline-none transition-colors hover:bg-slate-800 focus:bg-slate-800"
          >
            <LogOut className="h-4 w-4 text-slate-400" aria-hidden="true" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
