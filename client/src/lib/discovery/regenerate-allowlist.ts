// src/lib/discovery/regenerate-allowlist.ts
//
// Email allowlist gate for the recommendation regenerate button.
// Added 2026-05-18 as the founder-facing half of the diagnosis+fix for
// recommendation cmpbbtfme0001l304arowe4hs (empty-but-schema-valid row).
//
// Both the page server component and the regenerate API route call
// `isRegenerateAllowed(session.user.email)` to decide whether to render
// the button (page) and whether to accept the request (route). Failure
// modes are intentionally identical — when the env var is unset or the
// email is absent, both surfaces fail closed.
//
// Safe to remove (or just clear ADMIN_REGENERATE_EMAILS) once the row
// is fixed and the founder is satisfied.

import 'server-only';
import { env } from '@/lib/env';

function regenerateAllowlist(): Set<string> {
  const raw = env.ADMIN_REGENERATE_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw.split(',').map(e => e.trim().toLowerCase()).filter(e => e.length > 0),
  );
}

/**
 * Returns true when the given email is in the ADMIN_REGENERATE_EMAILS
 * allowlist. Empty / null emails always return false (fail-closed).
 */
export function isRegenerateAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return regenerateAllowlist().has(email.toLowerCase());
}
