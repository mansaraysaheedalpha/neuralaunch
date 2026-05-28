// src/app/(app)/layout.tsx
//
// Signed-in app shell. Every (app)/* route gets the Institute sidebar
// + mobile drawer chrome via <AppShell>. The marketing header is not
// rendered here — signed-in surfaces own their own crumbs.

import { AppShell } from '@/components/institute';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
