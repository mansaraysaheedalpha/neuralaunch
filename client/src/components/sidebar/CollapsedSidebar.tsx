'use client';
// src/components/sidebar/CollapsedSidebar.tsx

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Compass, User, Wrench } from 'lucide-react';
import { useHasRoadmap } from './useHasRoadmap';

export interface CollapsedSidebarProps {
  onExpand: () => void;
}

/**
 * CollapsedSidebar — the slim 80px-wide rail shown when the sidebar
 * is collapsed on desktop. Expand button + the same nav icons as
 * SidebarNav, just in icon-only form.
 */
export function CollapsedSidebar({ onExpand }: CollapsedSidebarProps) {
  const pathname = usePathname();
  const { status } = useSession();
  const { hasRoadmap } = useHasRoadmap(status === 'authenticated');
  const isDiscoveryActive = pathname === '/discovery' || pathname?.startsWith('/discovery/');
  const isToolsActive     = pathname === '/tools' || pathname?.startsWith('/tools/');
  const isProfileActive   = pathname === '/profile';

  return (
    <div className="flex flex-col h-full bg-card text-card-foreground border-r border-border p-2 pt-4 items-center">
      <button
        onClick={onExpand}
        className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground mb-4 transition-transform hover:scale-105"
        aria-label="Expand sidebar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      </button>
      <Link
        href="/discovery"
        className={`group relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors mb-1 ${
          isDiscoveryActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
        }`}
        title="Discovery"
      >
        <Compass className="w-5 h-5" />
      </Link>
      {hasRoadmap && (
        <Link
          href="/tools"
          className={`group relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors mb-1 ${
            isToolsActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
          }`}
          title="Tools"
        >
          <Wrench className="w-5 h-5" />
        </Link>
      )}
      <Link
        href="/profile"
        className={`group relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
          isProfileActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
        }`}
        title="My Profile"
      >
        <User className="w-5 h-5" />
      </Link>
    </div>
  );
}
