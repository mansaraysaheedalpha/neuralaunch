// src/lib/auth/account-deletion-constants.ts
//
// Single source of truth for the literal event name fired by the
// account-deletion route and consumed by the deletion saga worker.

export const ACCOUNT_DELETION_EVENT = 'user/account.delete.requested' as const;
