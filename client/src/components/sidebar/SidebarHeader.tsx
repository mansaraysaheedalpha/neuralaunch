'use client';
// src/components/sidebar/SidebarHeader.tsx

import Link from 'next/link';
import { Compass } from 'lucide-react';

export interface SidebarHeaderProps {
  onCollapse:    () => void;
  onCloseMobile: () => void;
}

/**
 * SidebarHeader — top of the sidebar.
 *
 * Contains the primary "Start Discovery" CTA and the two close
 * controls (collapse on desktop, dismiss on mobile). Pure UI; no
 * data dependencies.
 */
export function SidebarHeader({ onCollapse, onCloseMobile }: SidebarHeaderProps) {
  return (
    <div className="p-4 border-b border-border flex-shrink-0 flex items-center gap-2">
      <Link
        href="/discovery"
        onClick={onCloseMobile}
        className="flex-1 flex items-center justify-center px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transform hover:scale-[1.02] active:scale-[0.98] group"
      >
        <Compass className="w-5 h-5 mr-2 flex-shrink-0" />
        <span className="truncate">Start Discovery</span>
      </Link>
      <button
        onClick={onCollapse}
        className="w-10 h-10 hidden md:flex items-center justify-center rounded-lg hover:bg-muted"
        aria-label="Collapse sidebar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      </button>
      <button
        onClick={onCloseMobile}
        className="w-10 h-10 md:hidden flex items-center justify-center rounded-lg hover:bg-muted"
        aria-label="Close menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
