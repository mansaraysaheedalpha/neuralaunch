"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { Menu, X, LogOut } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

/**
 * MarketingHeader — Institute chrome.
 *
 * Sticky 22-px-padded bar with a backdrop blur, mono caps copy at 11px,
 * the accent brand mark on the left, minimal-link nav, an outlined-pill
 * CTA on the right (or an avatar dropdown for signed-in viewers).
 * Visual grammar: direction-a.html .nav + about.html .nav.
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
    <header className="sticky top-0 z-50 border-b border-rule bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] backdrop-blur-md">
      <div className="flex items-center justify-between px-5 py-5 sm:px-10 sm:py-[22px]">
        {/* Brand */}
        <Link
          href="/"
          aria-label="NeuraLaunch home"
          className="flex items-center gap-3.5 font-mono text-[11px] uppercase tracking-[0.14em] text-fg transition-colors hover:text-accent"
        >
          <BrandMark />
          <span>NeuraLaunch</span>
        </Link>

        {/* Desktop nav — minimal links, mono caps. */}
        <nav
          aria-label="Primary"
          className="hidden items-center gap-7 font-mono text-[11px] uppercase tracking-[0.14em] md:flex"
        >
          <Link href="/#cycle" className="text-muted transition-colors hover:text-fg">
            The cycle
          </Link>
          <Link
            href="/#surface"
            className="text-muted transition-colors hover:text-fg"
          >
            A recommendation
          </Link>
          <Link href="/#tools" className="text-muted transition-colors hover:text-fg">
            Tools
          </Link>
          <Link
            href="/#pricing"
            className="text-muted transition-colors hover:text-fg"
          >
            Price
          </Link>

          {status === "loading" ? (
            <span className="h-7 w-24 bg-rule" aria-hidden="true" />
          ) : isAuthed ? (
            <UserMenu displayName={displayName} initials={initials} />
          ) : (
            <>
              <Link
                href="/signin"
                className="text-muted transition-colors hover:text-fg"
              >
                Sign in
              </Link>
              <Link
                href="/discovery"
                className="inline-flex items-center rounded-full border border-rule-strong px-4 py-2 text-fg transition-colors hover:border-accent hover:text-accent"
              >
                Begin
              </Link>
            </>
          )}
        </nav>

        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-marketing-nav"
          aria-label="Toggle navigation menu"
          className="inline-flex items-center justify-center border border-rule-strong p-2 text-fg transition-colors hover:border-accent hover:text-accent md:hidden"
        >
          {mobileOpen ? (
            <X aria-hidden="true" className="size-5" />
          ) : (
            <Menu aria-hidden="true" className="size-5" />
          )}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          id="mobile-marketing-nav"
          className="border-t border-rule bg-bg px-5 py-5 md:hidden"
        >
          <ul className="grid gap-3.5 font-mono text-[12px] uppercase tracking-[0.14em]">
            <li>
              <Link
                href="/#cycle"
                onClick={() => setMobileOpen(false)}
                className="text-muted transition-colors hover:text-fg"
              >
                The cycle
              </Link>
            </li>
            <li>
              <Link
                href="/#surface"
                onClick={() => setMobileOpen(false)}
                className="text-muted transition-colors hover:text-fg"
              >
                A recommendation
              </Link>
            </li>
            <li>
              <Link
                href="/#tools"
                onClick={() => setMobileOpen(false)}
                className="text-muted transition-colors hover:text-fg"
              >
                Tools
              </Link>
            </li>
            <li>
              <Link
                href="/#pricing"
                onClick={() => setMobileOpen(false)}
                className="text-muted transition-colors hover:text-fg"
              >
                Price
              </Link>
            </li>
            <li className="mt-2 border-t border-rule pt-4">
              {isAuthed ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    void signOut();
                  }}
                  className="inline-flex items-center gap-2 text-fg"
                >
                  <LogOut aria-hidden="true" className="size-3.5" />
                  Sign out · {displayName}
                </button>
              ) : (
                <Link
                  href="/discovery"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex items-center border border-rule-strong px-4 py-2 text-fg transition-colors hover:border-accent hover:text-accent"
                >
                  Begin
                </Link>
              )}
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Internals                                                                 */
/* -------------------------------------------------------------------------- */

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="relative inline-block size-[18px] rounded-full bg-accent"
    >
      <span className="absolute inset-[5px] rounded-full bg-bg" />
    </span>
  );
}

function UserMenu({
  displayName,
  initials,
}: {
  displayName: string;
  initials: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="inline-flex items-center gap-2 border border-rule-strong px-3 py-1.5 text-fg transition-colors hover:border-accent hover:text-accent"
        >
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent text-[9px] font-medium text-bg">
            {initials}
          </span>
          <span className="max-w-[140px] truncate normal-case tracking-normal">
            {displayName}
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="z-50 grid w-56 gap-0 border border-rule-strong bg-bg-2 p-0 font-mono text-[11px] uppercase tracking-[0.14em] text-muted shadow-2xl"
        >
          <DropdownMenu.Item asChild>
            <Link
              href="/discovery"
              className="block cursor-pointer px-4 py-3 outline-none transition-colors hover:bg-bg-3 hover:text-fg focus:bg-bg-3 focus:text-fg"
            >
              Open app
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              className="block cursor-pointer border-t border-rule px-4 py-3 outline-none transition-colors hover:bg-bg-3 hover:text-fg focus:bg-bg-3 focus:text-fg"
            >
              Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => void signOut()}
            className="cursor-pointer border-t border-rule px-4 py-3 outline-none transition-colors hover:bg-bg-3 hover:text-accent focus:bg-bg-3 focus:text-accent"
          >
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
