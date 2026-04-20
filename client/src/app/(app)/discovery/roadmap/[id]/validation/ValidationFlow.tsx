'use client';
// src/app/(app)/discovery/roadmap/[id]/validation/ValidationFlow.tsx
//
// Task-scoped Validation flow — deliberately simpler than the
// multi-step flows for Coach/Research. Validation is a one-shot
// Opus generation → preview → (optional) publish → passive
// analytics, so the flow is closer to PackagerFlow's
// generate-then-adjust shape than Coach's full state machine.
//
// Shape:
//   1. User types what they're validating (single textarea).
//   2. On submit, POSTs the task-scoped create route.
//   3. Renders a short confirmation with the slug + a link to the
//      full validation-page editor for preview / publish / analytics.
//
// Publish, analytics, and layout-variant switching already have
// polished UIs under /discovery/validation/[pageId] — the flow hands
// off there rather than duplicating those surfaces inline.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, CheckCircle2 } from 'lucide-react';

export interface ValidationFlowProps {
  roadmapId: string;
  taskId:    string;
  open:      boolean;
  onClose:   () => void;
}

type Phase = 'idle' | 'generating' | 'success' | 'error';

interface CreateResponse {
  pageId:        string;
  slug:          string;
  status:        'DRAFT' | 'LIVE' | 'ARCHIVED';
  alreadyExists: boolean;
}

export function ValidationFlow({ roadmapId, taskId, open, onClose }: ValidationFlowProps) {
  const router = useRouter();
  const [target, setTarget] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<CreateResponse | null>(null);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handleGenerate() {
    if (!target.trim() || phase === 'generating') return;
    setPhase('generating');
    setError('');
    try {
      const res = await fetch(
        `/api/discovery/roadmaps/${roadmapId}/tasks/${taskId}/validation-page`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ target: target.trim() }),
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setPhase('error');
        setError(json.error ?? 'Could not create the validation page. Try again in a moment.');
        return;
      }
      const json = await res.json() as CreateResponse;
      setResult(json);
      setPhase('success');
      router.refresh();
    } catch {
      setPhase('error');
      setError('Network error — please try again.');
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Validation page</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A live landing page you can share to measure real market signal before investing more time.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      {phase !== 'success' && (
        <div className="mt-4 flex flex-col gap-2">
          <label className="text-xs font-medium text-foreground" htmlFor="validation-target">
            What are you validating for this task?
          </label>
          <textarea
            id="validation-target"
            value={target}
            onChange={e => setTarget(e.target.value)}
            disabled={phase === 'generating'}
            maxLength={2000}
            rows={4}
            placeholder="e.g. A $49/month premium tier for coaches that includes monthly strategy calls and a private Slack channel. I want to see if coaches will sign up before I build the private community."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          />
          <p className="text-[11px] text-muted-foreground">
            We&apos;ll generate a draft landing page. You can preview, edit, and publish it from the next screen.
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={phase === 'generating'}
              className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { void handleGenerate(); }}
              disabled={phase === 'generating' || target.trim().length === 0}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {phase === 'generating' ? 'Generating…' : 'Generate page'}
            </button>
          </div>
        </div>
      )}

      {phase === 'success' && result && (
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-success/30 bg-success/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {result.alreadyExists ? 'Existing page ready' : 'Validation page drafted'}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Open the page editor to preview it, customise the copy, and publish it when you&apos;re
            ready. Once live, share the URL and watch the analytics come back here.
          </p>
          <Link
            href={`/discovery/validation/${result.pageId}`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Open validation page editor →
          </Link>
        </div>
      )}
    </div>
  );
}
