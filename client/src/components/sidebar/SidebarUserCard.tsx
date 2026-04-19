'use client';
// src/components/sidebar/SidebarUserCard.tsx
//
// Bottom-of-sidebar user identity card. Mirrors the pattern founders
// already know from other SaaS products (Claude, Linear, Vercel) —
// avatar + name + plan pill. Free-tier users additionally see a
// compact Upgrade CTA so the path out of Free is always visible
// regardless of which screen they're on.

import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { Sparkles } from 'lucide-react';

type Tier = 'free' | 'execute' | 'compound';

const TIER_LABEL: Record<Tier, string> = {
  free:     'Free plan',
  execute:  'Execute plan',
  compound: 'Compound plan',
};

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? email ?? '').trim();
  if (source.length === 0) return 'U';
  const parts = source.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] ?? '').concat(parts[1][0] ?? '').toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function SidebarUserCard() {
  const { data: session, status } = useSession();

  if (status !== 'authenticated' || !session?.user) {
    return (
      <Link
        href="/signin"
        className="flex items-center gap-2 rounded-xl p-2 hover:bg-muted transition-colors"
      >
        <div className="size-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
          <Sparkles className="size-4" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">NeuraLaunch</p>
          <p className="text-xs text-muted-foreground">Sign in to continue</p>
        </div>
      </Link>
    );
  }

  const tier = (session.user.tier ?? 'free') as Tier;
  const name = session.user.name ?? session.user.email ?? 'You';
  const image = session.user.image;
  const pillClass =
    tier === 'compound'
      ? 'border-gold/30 bg-gold/10 text-gold'
      : tier === 'execute'
        ? 'border-primary/30 bg-primary/10 text-primary'
        : 'border-border bg-muted text-muted-foreground';

  return (
    <div className="flex flex-col gap-2">
      <Link
        href="/settings"
        className="flex items-center gap-2 rounded-xl p-2 hover:bg-muted transition-colors"
        aria-label="Account and billing settings"
      >
        {image ? (
          <Image
            src={image}
            alt=""
            width={36}
            height={36}
            className="size-9 rounded-full object-cover"
          />
        ) : (
          <div className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
            {initials(session.user.name, session.user.email)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{name}</p>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${pillClass}`}
          >
            {TIER_LABEL[tier]}
          </span>
        </div>
      </Link>

      {tier === 'free' && (
        <Link
          href="/#pricing"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          Upgrade
        </Link>
      )}
    </div>
  );
}
