'use client';
// src/components/sidebar/MobileUpgradePill.tsx
//
// Small compact upgrade CTA anchored top-right on mobile viewports.
// Pairs with the sidebar's SidebarUserCard + CollapsedSidebar pill so
// the path out of Free is always visible, even when the mobile
// sidebar is closed and the user only sees the main content area.
//
// Renders nothing on desktop (md:hidden) and nothing when the user is
// unauthenticated or already on a paid tier.

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Sparkles } from 'lucide-react';

export function MobileUpgradePill() {
  const { data: session, status } = useSession();
  if (status !== 'authenticated') return null;
  const tier = session?.user?.tier ?? 'free';
  if (tier !== 'free') return null;

  return (
    <Link
      href="/#pricing"
      className="md:hidden absolute top-4 right-4 z-30 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold shadow-md hover:opacity-90 transition-opacity"
      aria-label="Upgrade plan"
    >
      <Sparkles className="size-3.5" aria-hidden="true" />
      Upgrade
    </Link>
  );
}
