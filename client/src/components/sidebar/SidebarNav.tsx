'use client';
// src/components/sidebar/SidebarNav.tsx

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Compass, Settings, Wrench } from 'lucide-react';
import { useHasRoadmap } from './useHasRoadmap';

export interface SidebarNavProps {
  onNavigate: () => void;
}

/**
 * SidebarNav — primary navigation links inside the expanded sidebar.
 *
 * Discovery (with two indented children: Past recommendations,
 * Validation pages) and My Profile. The active-route highlighting
 * is the only stateful concern; everything else is router-driven.
 *
 * The "Spark Index" (/trends) and "My Projects" (/projects) sidebar
 * items were intentionally removed earlier — those routes were
 * deleted in the cleanup and the dead links produced 404s on click.
 */
export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const { status } = useSession();
  const { hasRoadmap } = useHasRoadmap(status === 'authenticated');

  const isDiscoveryActive  = pathname === '/discovery' || pathname?.startsWith('/discovery/');
  const isPastRecsActive   = pathname === '/discovery/recommendations' || pathname?.startsWith('/discovery/recommendations/');
  const isValidationActive = pathname === '/discovery/validation' || pathname?.startsWith('/discovery/validation/');
  const isToolsActive      = pathname === '/tools' || pathname?.startsWith('/tools/');
  const isSettingsActive   = pathname === '/settings' || pathname?.startsWith('/settings/');

  return (
    <div className="p-2">
      <Link
        href="/discovery"
        onClick={onNavigate}
        aria-current={isDiscoveryActive ? 'page' : undefined}
        className={`group relative flex items-center px-3 py-3 rounded-xl transition-all duration-200 ${
          isDiscoveryActive ? 'bg-primary/10' : 'hover:bg-muted'
        }`}
      >
        {isDiscoveryActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
        )}
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-all duration-200 ${
          isDiscoveryActive
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
        }`}>
          <Compass className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-base font-medium truncate ${
            isDiscoveryActive ? 'text-primary font-semibold' : 'text-foreground'
          }`}>
            Discovery
          </p>
        </div>
      </Link>

      <Link
        href="/discovery/recommendations"
        onClick={onNavigate}
        aria-current={isPastRecsActive ? 'page' : undefined}
        className={`group relative flex items-center px-3 py-2 rounded-xl transition-all duration-200 ml-8 ${
          isPastRecsActive ? 'bg-primary/10' : 'hover:bg-muted'
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className={`text-sm truncate ${
            isPastRecsActive
              ? 'text-primary font-semibold'
              : 'text-muted-foreground group-hover:text-foreground'
          }`}>
            Past recommendations
          </p>
        </div>
      </Link>

      <Link
        href="/discovery/validation"
        onClick={onNavigate}
        aria-current={isValidationActive ? 'page' : undefined}
        className={`group relative flex items-center px-3 py-2 rounded-xl transition-all duration-200 ml-8 ${
          isValidationActive ? 'bg-primary/10' : 'hover:bg-muted'
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className={`text-sm truncate ${
            isValidationActive
              ? 'text-primary font-semibold'
              : 'text-muted-foreground group-hover:text-foreground'
          }`}>
            Validation pages
          </p>
        </div>
      </Link>

      {/* Tools section — only visible when the founder has at least
          one roadmap, because the tools are context-aware and need
          the belief state + recommendation to produce useful output. */}
      {hasRoadmap && (
        <Link
          href="/tools"
          onClick={onNavigate}
          aria-current={isToolsActive ? 'page' : undefined}
          className={`group relative flex items-center px-3 py-3 rounded-xl transition-all duration-200 ${
            isToolsActive ? 'bg-primary/10' : 'hover:bg-muted'
          }`}
        >
          {isToolsActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
          )}
          <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-all duration-200 ${
            isToolsActive
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
          }`}>
            <Wrench className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-base font-medium truncate ${
              isToolsActive ? 'text-primary font-semibold' : 'text-foreground'
            }`}>
              Tools
            </p>
          </div>
        </Link>
      )}

      <Link
        href="/settings"
        onClick={onNavigate}
        aria-current={isSettingsActive ? 'page' : undefined}
        className={`group relative flex items-center px-3 py-3 rounded-xl transition-all duration-200 ${
          isSettingsActive ? 'bg-primary/10' : 'hover:bg-muted'
        }`}
      >
        {isSettingsActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
        )}
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-all duration-200 ${
          isSettingsActive
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
        }`}>
          <Settings className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${
            isSettingsActive ? 'text-primary font-semibold' : 'text-foreground'
          }`}>
            Settings
          </p>
        </div>
      </Link>
    </div>
  );
}
