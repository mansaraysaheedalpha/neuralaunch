'use client';
// src/components/sidebar/SidebarNav.tsx

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Compass, Settings, Wrench, LayoutGrid, Globe, type LucideIcon } from 'lucide-react';
import { useHasRoadmap } from './useHasRoadmap';
import { useHasValidationPages } from './useHasValidationPages';

export interface SidebarNavProps {
  onNavigate: () => void;
}

/**
 * SidebarNav — primary top-level navigation inside the expanded sidebar.
 *
 * Five flat siblings (no nesting), each conditional where it makes sense:
 *   1. Discovery — always visible
 *   2. Ventures (or "Past recommendations" for Free) — always visible
 *      Renamed + promoted from sub-item under Discovery; "your" dropped
 *      because the sidebar context already implies ownership.
 *   3. Validation pages — only when the user has ≥1 page (avoids an
 *      empty-list link cluttering the nav for founders who never used
 *      the tool)
 *   4. Tools — only when the user has ≥1 roadmap (tools are context-
 *      aware and need a recommendation to produce useful output)
 *   5. Settings — always visible
 *
 * Active-route highlighting is the only stateful concern; everything
 * else is router-driven. Icons consolidated into a single NavItem helper
 * so the markup stays under the 200-line cap — the previous flat
 * Tailwind-by-hand layout was 175 lines for 4 entries; this scales to 5.
 */
export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const { status, data: session } = useSession();
  const { hasRoadmap }        = useHasRoadmap(status === 'authenticated');
  const { hasValidationPage } = useHasValidationPages(status === 'authenticated');

  // Free users have 0 ventures by tier (TIER_VENTURE_LIMITS.free = 0)
  // — they have past recommendations but not "ventures." Keep the
  // dynamic relabel so the door label matches the room label.
  const tier = session?.user?.tier ?? 'free';
  const venturesLabel = tier === 'execute' || tier === 'compound'
    ? 'Ventures'
    : 'Past recommendations';

  const isDiscoveryActive  = pathname === '/discovery' || pathname?.startsWith('/discovery/');
  const isVenturesActive   = pathname === '/discovery/recommendations' || pathname?.startsWith('/discovery/recommendations/');
  const isValidationActive = pathname === '/discovery/validation' || pathname?.startsWith('/discovery/validation/');
  const isToolsActive      = pathname === '/tools' || pathname?.startsWith('/tools/');
  const isSettingsActive   = pathname === '/settings' || pathname?.startsWith('/settings/');

  return (
    <div className="p-2">
      <NavItem
        href="/discovery"
        icon={Compass}
        label="Discovery"
        active={!!isDiscoveryActive && pathname === '/discovery'}
        onClick={onNavigate}
      />
      <NavItem
        href="/discovery/recommendations"
        icon={LayoutGrid}
        label={venturesLabel}
        active={!!isVenturesActive}
        onClick={onNavigate}
      />
      {hasValidationPage && (
        <NavItem
          href="/discovery/validation"
          icon={Globe}
          label="Validation pages"
          active={!!isValidationActive}
          onClick={onNavigate}
        />
      )}
      {hasRoadmap && (
        <NavItem
          href="/tools"
          icon={Wrench}
          label="Tools"
          active={!!isToolsActive}
          onClick={onNavigate}
        />
      )}
      <NavItem
        href="/settings"
        icon={Settings}
        label="Settings"
        active={!!isSettingsActive}
        onClick={onNavigate}
      />
    </div>
  );
}

interface NavItemProps {
  href:    string;
  icon:    LucideIcon;
  label:   string;
  active:  boolean;
  onClick: () => void;
}

/**
 * Single top-level sidebar entry. Active state shows a left primary
 * rail and an icon-tile fill in primary; inactive state uses the muted
 * palette with a hover lift to primary tint. The icon-tile gives every
 * entry consistent visual weight whether it's Discovery (top of list)
 * or Settings (bottom).
 */
function NavItem({ href, icon: Icon, label, active, onClick }: NavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center px-3 py-3 rounded-xl transition-all duration-200 ${
        active ? 'bg-primary/10' : 'hover:bg-muted'
      }`}
    >
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
      )}
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-all duration-200 ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
      }`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-base font-medium truncate ${
          active ? 'text-primary font-semibold' : 'text-foreground'
        }`}>
          {label}
        </p>
      </div>
    </Link>
  );
}
