'use client';
// src/app/(app)/settings/AccountInfoSection.tsx

import Image from 'next/image';
import { Github } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';

interface AccountInfoSectionProps {
  name:      string | null;
  email:     string | null;
  image:     string | null;
  providers: string[];
}

/**
 * AccountInfoSection — read-only account card showing avatar, name,
 * email, and connected OAuth providers. Replaces the standalone
 * /profile page's account information card.
 */
export function AccountInfoSection({
  name,
  email,
  image,
  providers,
}: AccountInfoSectionProps) {
  const initials = name
    ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : email?.slice(0, 2).toUpperCase() ?? 'U';

  const hasGoogle = providers.includes('google');
  const hasGithub = providers.includes('github');

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-5">
      {/* Avatar + name + email */}
      <div className="flex items-center gap-4">
        {image ? (
          <Image
            src={image}
            alt={name ?? 'Avatar'}
            width={56}
            height={56}
            className="size-14 rounded-full border-2 border-primary/20 object-cover"
          />
        ) : (
          <div className="size-14 rounded-full border-2 border-primary/20 bg-primary flex items-center justify-center text-sm font-semibold text-primary-foreground">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {name ?? 'User'}
          </p>
          {email && (
            <p className="text-xs text-muted-foreground truncate">{email}</p>
          )}
        </div>
      </div>

      {/* Connected providers */}
      <div className="border-t border-border pt-4 flex flex-col gap-3">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">
          Connected accounts
        </p>

        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-white dark:bg-slate-800 border flex items-center justify-center">
            <FcGoogle className="size-4" />
          </div>
          <p className="text-xs text-foreground">Google</p>
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
            hasGoogle
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground'
          }`}>
            {hasGoogle ? 'Connected' : 'Not connected'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-gray-900 dark:bg-gray-700 flex items-center justify-center">
            <Github className="size-4 text-white" />
          </div>
          <p className="text-xs text-foreground">GitHub</p>
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
            hasGithub
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
          }`}>
            {hasGithub ? 'Connected' : 'Not connected'}
          </span>
        </div>
      </div>
    </div>
  );
}
