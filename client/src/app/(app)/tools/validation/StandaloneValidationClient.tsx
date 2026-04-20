'use client';
// src/app/(app)/tools/validation/StandaloneValidationClient.tsx
//
// Client component for the /tools/validation standalone flow.
// Accepts a list of the user's recommendations as an optional
// "tie this to a recommendation" picker. When a recommendation is
// selected, POSTs the existing recommendation-scoped create route so
// the page is properly tied in and fed by the continuation brief
// loader. When no recommendation is picked, POSTs the
// /api/tools/validation/generate truly-standalone route.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

export interface RecommendationOption {
  id:        string;
  label:     string;
  createdAt: string;
}

interface StandaloneValidationClientProps {
  recommendations: RecommendationOption[];
}

type Phase = 'idle' | 'generating' | 'success' | 'error';

interface CreateResponse {
  pageId: string;
  slug:   string;
}

function formatRecommendationDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function StandaloneValidationClient({ recommendations }: StandaloneValidationClientProps) {
  const router = useRouter();
  const [target, setTarget] = useState('');
  const [selectedRec, setSelectedRec] = useState<string>('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<CreateResponse | null>(null);
  const [error, setError] = useState('');

  async function handleGenerate() {
    if (!target.trim() || phase === 'generating') return;
    setPhase('generating');
    setError('');
    try {
      // When tied to a recommendation, use the existing recommendation-
      // scoped route so the page participates in the recommendation's
      // existing lifecycle (continuation signal, negative-signal block,
      // etc). Otherwise POST the truly-standalone route.
      const url = selectedRec
        ? `/api/discovery/recommendations/${selectedRec}/validation-page`
        : '/api/tools/validation/generate';
      const body = selectedRec ? undefined : JSON.stringify({ target: target.trim() });
      const res = await fetch(url, {
        method:  'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        setPhase('error');
        setError(json.error ?? 'Could not create the validation page.');
        return;
      }
      const json = await res.json() as { pageId: string; slug: string };
      setResult({ pageId: json.pageId, slug: json.slug });
      setPhase('success');
      router.refresh();
    } catch {
      setPhase('error');
      setError('Network error — please try again.');
    }
  }

  if (phase === 'success' && result) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-success/30 bg-success/5 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Validation page drafted
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Open the page editor to preview it, customise the copy, and publish it
          when you&apos;re ready. Once live, share the URL and watch the
          analytics come back to the editor.
        </p>
        <Link
          href={`/discovery/validation/${result.pageId}`}
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Open validation page editor →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-foreground" htmlFor="target">
          What do you want to validate?
        </label>
        <textarea
          id="target"
          value={target}
          onChange={e => setTarget(e.target.value)}
          disabled={phase === 'generating'}
          maxLength={2000}
          rows={5}
          placeholder="e.g. A $99/month premium coaching community for mid-career engineers — weekly group calls, private Slack, and a resume-review service. I want to see if mid-career engineers will sign up before I build the private community."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        />
      </div>

      {recommendations.length > 0 && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground" htmlFor="recommendation">
            Tie this to a recommendation (optional)
          </label>
          <select
            id="recommendation"
            value={selectedRec}
            onChange={e => setSelectedRec(e.target.value)}
            disabled={phase === 'generating'}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          >
            <option value="">None — create standalone</option>
            {recommendations.map(r => (
              <option key={r.id} value={r.id}>
                {formatRecommendationDate(r.createdAt)} — {r.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Tying to a recommendation means the page is scored into your
            venture&apos;s market signal for the continuation brief. Standalone
            pages are user-scoped — useful for quick tests outside your
            current venture.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => { void handleGenerate(); }}
          disabled={phase === 'generating' || target.trim().length === 0}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {phase === 'generating' ? 'Generating…' : 'Generate page'}
        </button>
      </div>
    </div>
  );
}
