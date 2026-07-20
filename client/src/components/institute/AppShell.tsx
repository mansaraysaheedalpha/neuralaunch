'use client';
// src/components/institute/AppShell.tsx
//
// The signed-in app shell. Wraps {children} in the Institute sidebar
// + mobile drawer behaviour and owns the mobile open/close state.
//
// Replaces the legacy Sidebar.tsx layout in (app)/layout.tsx. The
// marketing header is never rendered inside the shell — signed-in
// surfaces own their own crumbs / top bars.

import { useState, type ReactNode } from 'react';
import AppSidebar, { AppMobileBar } from './AppSidebar';
import { BackgroundJobsBanner } from '@/components/tool-jobs/BackgroundJobsBanner';
import { MobileUpgradePill } from '@/components/sidebar/MobileUpgradePill';

export interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh w-full max-w-full overflow-x-hidden bg-bg text-fg">
      <AppSidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="relative flex w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
        <AppMobileBar onOpen={() => setMobileOpen(true)} />

        {/* Mobile upgrade CTA — only renders for authenticated Free-tier
            users, only on mobile. Floats above content. */}
        <MobileUpgradePill />

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</main>

        {/* Floating background-jobs banner — polls /tool-jobs/active
            and surfaces in-flight ToolJob rows so the founder always
            knows what's running even after navigating away. */}
        <BackgroundJobsBanner />
      </div>
    </div>
  );
}
