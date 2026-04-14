"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { Menu, X, ArrowRight } from "lucide-react";

/**
 * MarketingHeader — fixed top header for the landing page and legal pages.
 * Dark navy background, electric blue CTA. Auth-aware: signed-in users
 * see "Open App", signed-out users see "Start Your Discovery →".
 */
export default function MarketingHeader() {
  const { data: session, status } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAuthed = status === "authenticated" && !!session;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800 bg-[#070F1C]/90 backdrop-blur supports-[backdrop-filter]:bg-[#070F1C]/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-90"
          aria-label="NeuraLaunch home"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#2563EB] text-sm font-bold tracking-tight text-white">
            NL
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">
            NeuraLaunch
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
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

        {/* Right-side CTA */}
        <div className="hidden items-center gap-3 md:flex">
          {isAuthed ? (
            <Link
              href="/discovery"
              className="inline-flex items-center gap-1.5 rounded-md bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#070F1C]"
            >
              Open App
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              href="/discovery"
              className="inline-flex items-center gap-1.5 rounded-md bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1D4ED8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#070F1C]"
            >
              Start Your Discovery
              <ArrowRight className="h-4 w-4" />
            </Link>
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
            <Link
              href="/discovery"
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[#2563EB] px-4 py-2.5 text-base font-semibold text-white hover:bg-[#1D4ED8]"
              onClick={() => setMobileOpen(false)}
            >
              {isAuthed ? "Open App" : "Start Your Discovery"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

