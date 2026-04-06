'use client';
// src/app/(app)/discovery/validation/[pageId]/ValidationPageControls.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePreviewFrameReload } from './PreviewFrame';

interface ValidationPageControlsProps {
  pageId:          string;
  recommendationId: string;
  slug:            string;
  status:          'DRAFT' | 'LIVE' | 'ARCHIVED';
  pageUrl:         string;
}

/**
 * ValidationPageControls
 *
 * Client component: Regenerate, Publish, and Copy Link controls shown
 * alongside the iframe preview of the validation landing page.
 */
export function ValidationPageControls({
  pageId,
  recommendationId,
  slug,
  status: initialStatus,
  pageUrl,
}: ValidationPageControlsProps) {
  const router = useRouter();
  const reloadPreview = usePreviewFrameReload();
  const [status,     setStatus]     = useState(initialStatus);
  const [regenerating, setRegenerating] = useState(false);
  const [publishing,   setPublishing]   = useState(false);
  const [copied,       setCopied]       = useState(false);
  const [error,        setError]        = useState('');

  async function handleRegenerate() {
    setRegenerating(true);
    setError('');
    try {
      const res = await fetch(`/api/discovery/recommendations/${recommendationId}/validation-page`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setError(json.error ?? 'Regeneration failed — try again.');
        return;
      }
      // Refresh server data AND force iframe remount with new content
      router.refresh();
      reloadPreview();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setRegenerating(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setError('');
    try {
      const res = await fetch(`/api/discovery/validation/${pageId}/publish`, {
        method: 'POST',
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setError(json.error ?? 'Publish failed — try again.');
        return;
      }
      setStatus('LIVE');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setPublishing(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — please copy the URL manually.');
    }
  }

  const isLive = status === 'LIVE';

  return (
    <div className="flex flex-col gap-4">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span className={[
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          isLive
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        ].join(' ')}>
          {isLive ? 'Live' : 'Draft'}
        </span>
        {isLive && (
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{pageUrl}</span>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {!isLive && (
          <button
            type="button"
            onClick={() => { void handlePublish(); }}
            disabled={publishing || regenerating}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {publishing ? 'Publishing…' : 'Publish page'}
          </button>
        )}

        {isLive && (
          <button
            type="button"
            onClick={() => { void handleCopy(); }}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {copied ? '✓ Link copied' : 'Copy link'}
          </button>
        )}

        <button
          type="button"
          onClick={() => { void handleRegenerate(); }}
          disabled={regenerating || publishing || isLive}
          className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          {regenerating ? 'Regenerating…' : 'Regenerate content'}
        </button>

        {isLive && (
          <p className="text-center text-xs text-muted-foreground">
            Publish is permanent — archive to regenerate.
          </p>
        )}
      </div>

      {/* Page URL input (always visible when live) */}
      {isLive && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
          <p className="text-xs text-muted-foreground mb-1">Your page URL</p>
          <p className="text-xs font-mono text-foreground break-all">{pageUrl}</p>
        </div>
      )}
    </div>
  );
}
