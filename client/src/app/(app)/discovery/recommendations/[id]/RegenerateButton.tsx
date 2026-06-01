'use client';

// src/app/(app)/discovery/recommendations/[id]/RegenerateButton.tsx
//
// Owner-side self-service repair button. Rendered only when the page
// server component determines the founder's email is in
// ADMIN_REGENERATE_EMAILS. Click confirms, POSTs to the regenerate
// endpoint, and surfaces inline status. No polling — the founder
// refreshes when ready (typical synthesis run is 60-120s end-to-end).

import { useState } from 'react';

type Status = 'idle' | 'submitting' | 'queued' | 'error';

interface RegenerateButtonProps {
  recommendationId: string;
}

export function RegenerateButton({ recommendationId }: RegenerateButtonProps) {
  const [status,  setStatus]  = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    const ok = window.confirm(
      'Re-run synthesis for this recommendation? The current row will be overwritten in 1–2 minutes. Refresh the page after to see the new content.',
    );
    if (!ok) return;

    setStatus('submitting');
    setMessage(null);
    try {
      const res = await fetch(
        `/api/discovery/recommendations/${recommendationId}/regenerate`,
        { method: 'POST', headers: { 'content-type': 'application/json' } },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        const detail = typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
        setStatus('error');
        setMessage(detail);
        return;
      }
      setStatus('queued');
      setMessage('Queued. Refresh in ~2 minutes.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Request failed');
    }
  }

  const label =
    status === 'submitting' ? 'Submitting…'
    : status === 'queued'   ? 'Queued ✓'
    :                         'Regenerate';

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => { void handleClick(); }}
        disabled={status === 'submitting' || status === 'queued'}
        className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted underline underline-offset-2 transition-colors hover:text-accent disabled:opacity-50 disabled:no-underline"
      >
        {label}
      </button>
      {message && (
        <span
          className={[
            'font-mono text-[10px] uppercase tracking-[0.14em]',
            status === 'error' ? 'text-amber' : 'text-muted',
          ].join(' ')}
        >
          {message}
        </span>
      )}
    </div>
  );
}
