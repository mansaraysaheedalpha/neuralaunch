'use client';
// src/app/(app)/settings/DangerZoneSection.tsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Loader2, AlertTriangle } from 'lucide-react';

/**
 * Settings → Danger zone → Delete account.
 *
 * Two-stage destructive action: a primary "Delete account" button
 * opens a confirmation dialog that requires the founder to type out
 * DELETE before the actual fetch fires.
 *
 * The route returns 202 — the deletion saga runs asynchronously. As
 * soon as the queue ack lands, we sign the founder out (clears the
 * NextAuth cookie / NextResponse.signOut) and redirect to /signin
 * with a confirmation banner. By the time they see the signin page
 * the saga has typically completed (Paddle cancel → row delete);
 * even if it hasn't, the founder cannot log back in because their
 * sessions get revoked by the saga in step 2.
 *
 * Honest copy disclosure: lists what will be cancelled / deleted in
 * the dialog so the founder isn't surprised. Mirrors the dunning /
 * consent UI pattern of "tell the user exactly what happens."
 */
export function DangerZoneSection() {
  const [open,    setOpen]    = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error,   setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const canSubmit = confirmText === 'DELETE' && !pending;

  function handleClose() {
    if (pending) return;
    setOpen(false);
    setConfirmText('');
    setError(null);
  }

  function handleDelete() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/user/delete-account', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ confirmation: 'DELETE' }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          const message = typeof body.error === 'string'
            ? body.error
            : 'Failed to delete account';
          setError(message);
          return;
        }
        // Saga is queued. Sign out + redirect; the saga's session-
        // revocation step ensures any in-flight tab also loses access
        // even if the cookie clear races the page navigation.
        await signOut({ redirect: false });
        router.push('/signin?deleted=1');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete account');
      }
    });
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-4 shrink-0 text-destructive mt-0.5" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">Delete account</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Permanently removes your NeuraLaunch account, cancels any active
              Paddle subscription, signs you out everywhere, and deletes your
              interview history, recommendations, roadmaps, and validation
              pages. This cannot be undone.
            </p>
          </div>
        </div>
        <div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition-opacity hover:opacity-80"
          >
            Delete account
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 id="delete-account-title" className="text-base font-semibold text-foreground">
              Delete your account?
            </h3>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              This will:
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground leading-relaxed list-disc pl-5">
              <li>Cancel any active Paddle subscription, immediately.</li>
              <li>Sign you out on every device.</li>
              <li>Delete your discovery sessions, recommendations, roadmaps, validation pages, and tool history.</li>
              <li>Remove your founder profile and all venture data.</li>
            </ul>
            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              Type <span className="font-mono font-semibold text-foreground">DELETE</span> below to confirm.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              autoComplete="off"
              autoFocus
              disabled={pending}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-destructive/40"
              placeholder="DELETE"
              aria-label="Type DELETE to confirm"
            />
            {error && (
              <p className="mt-3 text-xs text-destructive">{error}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={pending}
                className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-80 disabled:opacity-50 disabled:hover:opacity-50"
              >
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                {pending ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
