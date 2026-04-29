// src/lib/auth/admin.ts
//
// Admin allow-list auth helper for the moderation surfaces
// (currently the public-archive moderation queue at
// /admin/stories). When a second admin is needed, that's the
// moment to add a User.isAdmin column — not before. Premature.
//
// All admin routes route through assertAdminOrThrow() so the
// allow-list is enforced uniformly: page-level redirect on the
// server component side, 403 on the API side. No surface that
// reads admin data is allowed to skip this check.

import 'server-only';
import { auth } from '@/auth';
import { HttpError } from '@/lib/validation/server-helpers';

/**
 * Hard-coded for v1. Adding a second entry here is the right
 * answer once a second admin exists. Promoting this to a User
 * column is the right answer once there are 3+ admins or once
 * permissions need to differ across them.
 */
const ADMIN_EMAIL_ALLOWLIST: ReadonlySet<string> = new Set([
  'saheedmans78@gmail.com',
]);

export interface AdminSession {
  userId: string;
  email:  string;
}

/**
 * Returns the AdminSession when the current session belongs to
 * an allow-listed admin, throws HttpError(403) otherwise. Throws
 * HttpError(401) when there is no session at all so route
 * handlers surface "sign in first" vs "you can't do this" as
 * distinct errors.
 *
 * Use for API routes — the throw cleanly maps to httpErrorToResponse.
 */
export async function assertAdminOrThrow(): Promise<AdminSession> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw new HttpError(401, 'Unauthorised');
  }
  if (!ADMIN_EMAIL_ALLOWLIST.has(session.user.email.toLowerCase())) {
    throw new HttpError(403, 'Not authorised');
  }
  return { userId: session.user.id, email: session.user.email };
}

/**
 * Returns the AdminSession when authorised, null otherwise. Use
 * for server components — caller decides between redirect, 404,
 * or rendering "not authorised" inline.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  if (!ADMIN_EMAIL_ALLOWLIST.has(session.user.email.toLowerCase())) return null;
  return { userId: session.user.id, email: session.user.email };
}
