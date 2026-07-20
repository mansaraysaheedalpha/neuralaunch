'use client';
// src/components/institute/AppSidebar.tsx
//
// Slim left-rail used across every signed-in surface. Built to the
// shape in archetype.html .side — sticky 260px column on lg+, top-bar
// + drawer pattern on smaller viewports.
//
// The "Recent" section reuses the existing /api/conversations SWR
// fetch via useConversationsList — same source of truth the legacy
// Sidebar used, just rendered with the Institute treatment.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  useConversationsList,
  type SidebarConversation,
} from '@/components/sidebar/useConversationsList';

interface NavItem {
  label: string;
  href:  string;
  /** Match when pathname starts with one of these prefixes. */
  match: string[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Discovery', href: '/discovery', match: ['/discovery'] },
  { label: 'Ventures',  href: '/discovery/recommendations', match: ['/discovery/recommendations', '/discovery/roadmap'] },
  { label: 'Tools',     href: '/tools',     match: ['/tools'] },
  { label: 'Settings',  href: '/settings',  match: ['/settings'] },
];

const MAX_RECENTS = 6;

export interface AppSidebarProps {
  /** Mobile drawer open state, owned by AppShell. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function AppSidebar({ mobileOpen, onCloseMobile }: AppSidebarProps) {
  const pathname = usePathname();
  const { status, data: session } = useSession();
  const isAuthed = status === 'authenticated';

  return (
    <>
      {/* Mobile drawer — full-screen overlay. Hidden when closed. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          aria-hidden={!mobileOpen}
        >
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
          />
          <aside className="relative flex h-full w-[260px] flex-col border-r border-rule bg-bg py-6">
            <SidebarContent
              pathname={pathname}
              isAuthed={isAuthed}
              session={session}
              onLinkClick={onCloseMobile}
              showCloseButton
              onCloseMobile={onCloseMobile}
            />
          </aside>
        </div>
      )}

      {/* Desktop rail — sticky 260px column, hidden below lg. */}
      <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-rule bg-bg py-6 lg:flex">
        <SidebarContent
          pathname={pathname}
          isAuthed={isAuthed}
          session={session}
        />
      </aside>
    </>
  );
}

interface SidebarContentProps {
  pathname:        string | null;
  isAuthed:        boolean;
  session:         ReturnType<typeof useSession>['data'];
  onLinkClick?:    () => void;
  showCloseButton?: boolean;
  onCloseMobile?:  () => void;
}

function SidebarContent({
  pathname,
  isAuthed,
  session,
  onLinkClick,
  showCloseButton,
  onCloseMobile,
}: SidebarContentProps) {
  return (
    <>
      {/* Top — brand + new-discovery CTA */}
      <div className="px-5">
        <div className="mb-7 flex items-center justify-between gap-3">
          <Link
            href="/"
            onClick={onLinkClick}
            className="flex items-center gap-3"
            aria-label="NeuraLaunch home"
          >
            <span
              aria-hidden="true"
              className="relative inline-block size-[18px] shrink-0 rounded-full bg-accent"
            >
              <span className="absolute inset-[5px] rounded-full bg-bg" />
            </span>
            <span className="font-sans text-[15px] font-medium leading-[1.15] tracking-[-0.005em] text-fg">
              NeuraLaunch
              <span className="mt-1 block font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-muted">
                The Institute
              </span>
            </span>
          </Link>
          {showCloseButton && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close menu"
              className="inline-flex size-8 items-center justify-center text-muted transition-colors hover:text-fg"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>

        <Link
          href="/discovery"
          onClick={onLinkClick}
          className="flex w-full items-center justify-between gap-3 bg-accent px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5"
        >
          Start Discovery
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>

      {/* Nav */}
      <nav className="mt-6 grid gap-0.5 px-2.5" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(pathname, item.match);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onLinkClick}
              aria-current={active ? 'page' : undefined}
              className={[
                'group flex items-center gap-3 px-3.5 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors',
                active
                  ? 'text-fg'
                  : 'text-muted hover:bg-white/[0.03] hover:text-fg',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className={[
                  'inline-block size-[5px] shrink-0 rounded-full transition-colors',
                  active
                    ? 'bg-accent border-accent'
                    : 'border border-rule-strong group-hover:border-fg-2',
                ].join(' ')}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Recents */}
      <Recents isAuthed={isAuthed} onLinkClick={onLinkClick} />

      {/* User block */}
      <UserBlock isAuthed={isAuthed} session={session} onLinkClick={onLinkClick} />
    </>
  );
}

function Recents({
  isAuthed,
  onLinkClick,
}: {
  isAuthed:     boolean;
  onLinkClick?: () => void;
}) {
  const { conversations, isLoading } = useConversationsList(isAuthed);
  const visible = conversations.slice(0, MAX_RECENTS);
  // Hide the section entirely when there's nothing to show — avoids
  // an empty "Recent" header staring at a brand-new founder.
  if (!isLoading && visible.length === 0) {
    return <div className="mt-7 flex-1" />;
  }
  return (
    <div className="mt-7 flex-1 overflow-y-auto px-5">
      <h5 className="mb-3.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-2">
        Recent
      </h5>
      <ul className="grid">
        {isLoading && visible.length === 0
          ? [0, 1, 2].map((i) => (
              <li
                key={i}
                className="border-b border-rule py-2 last:border-b-0"
              >
                <span className="block h-[14px] w-3/4 animate-pulse bg-white/[0.04]" />
              </li>
            ))
          : visible.map((c) => (
              <li
                key={c.id}
                className="border-b border-rule last:border-b-0"
              >
                <Link
                  href={routeForConversation(c)}
                  onClick={onLinkClick}
                  className="group grid grid-cols-[1fr_auto] items-baseline gap-2.5 py-2 text-[13px] text-fg-2 transition-colors"
                >
                  <span className="truncate group-hover:text-accent">
                    {c.title || 'Untitled session'}
                  </span>
                  <RelativeTime iso={c.updatedAt} />
                </Link>
              </li>
            ))}
      </ul>
    </div>
  );
}

function UserBlock({
  isAuthed,
  session,
  onLinkClick,
}: {
  isAuthed:     boolean;
  session:      ReturnType<typeof useSession>['data'];
  onLinkClick?: () => void;
}) {
  if (!isAuthed || !session?.user) {
    // Signed-out shell — pre-auth (app) routes redirect to /signin via
    // their own auth guards, so this branch is only seen during the
    // brief window between sign-out and the redirect. Keep it minimal.
    return (
      <div className="mt-4 border-t border-rule px-5 py-3.5">
        <Link
          href="/signin"
          onClick={onLinkClick}
          className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-accent"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const user = session.user;
  const name = user.name ?? user.email ?? 'Founder';
  const initial = (name.trim().charAt(0) || 'F').toUpperCase();
  // session.user.tier exists in the NextAuth type augmentation; cast
  // here is safe because the auth callbacks always set it.
  const tier = (user as { tier?: string }).tier ?? 'free';
  const tierLabel = tier === 'free'
    ? 'Free'
    : tier === 'execute'
      ? 'Execute'
      : tier === 'compound'
        ? 'Compound'
        : tier;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="mt-4 grid w-full grid-cols-[28px_1fr] items-center gap-3 border-t border-rule px-5 py-3.5 text-left transition-colors hover:bg-white/[0.03] focus:outline-none focus-visible:bg-white/[0.03]"
          aria-label="Account menu"
        >
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-full font-serif text-[13px] italic text-bg"
            style={{
              background: 'linear-gradient(135deg, #ff5a3c, #b1331f)',
            }}
          >
            {initial}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] text-fg">{name}</span>
            <span className="mt-[2px] block font-mono text-[9px] uppercase tracking-[0.14em] text-accent">
              {tierLabel}
            </span>
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          side="top"
          sideOffset={6}
          className="z-50 w-[220px] border border-rule-strong bg-bg-2 p-1"
        >
          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              onClick={onLinkClick}
              className="flex cursor-pointer items-center px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-2 outline-none transition-colors hover:bg-white/[0.04] hover:text-fg focus:bg-white/[0.04]"
            >
              Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-rule" />
          <DropdownMenu.Item
            onSelect={() => void signOut({ callbackUrl: '/' })}
            className="flex cursor-pointer items-center px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-fg-2 outline-none transition-colors hover:bg-white/[0.04] hover:text-accent focus:bg-white/[0.04]"
          >
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* -------------------------------------------------------------------------- */
/*  AppMobileBar — top-bar variant for < lg viewports                          */
/* -------------------------------------------------------------------------- */

export function AppMobileBar({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between border-b border-rule bg-bg px-4 py-3 lg:hidden">
      <Link href="/" className="flex items-center gap-2.5" aria-label="NeuraLaunch home">
        <span
          aria-hidden="true"
          className="relative inline-block size-[16px] rounded-full bg-accent"
        >
          <span className="absolute inset-[4.5px] rounded-full bg-bg" />
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-fg">
          NeuraLaunch
        </span>
      </Link>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open menu"
        className="inline-flex size-9 items-center justify-center text-fg transition-colors hover:text-accent"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isNavActive(pathname: string | null, matches: string[]): boolean {
  if (!pathname) return false;
  return matches.some(
    (m) => pathname === m || pathname.startsWith(`${m}/`),
  );
}

function routeForConversation(c: SidebarConversation): string {
  // The same precedence the existing ConversationList uses: no_idea
  // sessions go to their dedicated surface, ACTIVE discovery sessions
  // resume on /discovery, completed/expired ones open the read-only
  // transcript.
  if (c.noIdeaSessionId) return `/discovery/no-idea/${c.noIdeaSessionId}`;
  if (c.discoveryStatus === 'ACTIVE') return '/discovery';
  return `/chat/${c.id}`;
}

/**
 * Compact "Today", "3d", "12 May" style relative-time. Renders empty
 * on first paint, swaps to the locale-aware string post-mount —
 * avoids hydration mismatch from differing Date semantics between
 * server and client and the user's locale.
 */
function RelativeTime({ iso }: { iso: string }) {
  // One-shot post-mount compute. Renders empty on SSR (so the server
  // and client agree on first paint), then swaps to the locale-aware
  // string after hydration. The single setState inside the effect is
  // the intentional "I'm now on the client" signal — same pattern
  // used in StageBanner and the rest of the institute primitives.
  const [text, setText] = useState<string>('');
  useEffect(() => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((now.getTime() - d.getTime()) / dayMs);
    const next =
      diffDays < 1
        ? 'Today'
        : diffDays < 7
          ? `${diffDays}d`
          : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(next);
  }, [iso]);
  return (
    <span className="font-mono text-[10px] tracking-[0.04em] text-muted">
      {text}
    </span>
  );
}
