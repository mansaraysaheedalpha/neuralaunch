'use client';
// src/components/billing/UsageMeter.tsx
//
// Per-tool cycle-usage indicator. Renders a compact meter showing
// "<used> of <limit> <toolLabel> used this cycle. Resets <date>."
//
// Visual state machine:
//   <80%      → muted (slate)
//   80-99%    → emphasised in tier accent (primary for Execute,
//               gold for Compound)
//   100%      → cap-reached banner with upgrade CTA for Execute
//               users, plain reset notice for Compound users
//
// Data flow: SWR-fetches /api/usage on mount, picks the row matching
// the `tool` prop, renders. Refetches when the tool page does work
// that might consume quota (caller can force a refresh by bumping
// the optional `refreshKey` prop).

import useSWR from 'swr';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Sparkles } from 'lucide-react';

type CycleTool = 'research' | 'coach' | 'composer' | 'packager';

interface UsageRow {
  tool:      CycleTool;
  toolLabel: string;
  used:      number;
  limit:     number;
  resetsAt:  string;
}

interface UsageResponse {
  usage: UsageRow[];
}

interface UsageMeterProps {
  /** Which tool to surface. */
  tool:        CycleTool;
  /** Optional bump to force a refetch (e.g. after a successful call). */
  refreshKey?: number | string;
  /** Optional className for layout overrides. */
  className?:  string;
}

const fetcher = async (url: string): Promise<UsageResponse> => {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`usage fetch failed: ${res.status}`);
  return (await res.json()) as UsageResponse;
};

function formatResetDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day:   'numeric',
    });
  } catch {
    return iso;
  }
}

export function UsageMeter({ tool, refreshKey, className }: UsageMeterProps) {
  const { data: session } = useSession();
  const tier = session?.user?.tier ?? 'free';

  // Free users do not have access to these tools, so the meter would
  // be misleading — render nothing and let the page-level
  // UpgradePrompt handle the empty-state.
  const enabled = tier === 'execute' || tier === 'compound';

  const { data, error } = useSWR<UsageResponse, Error>(
    enabled ? `/api/usage?k=${refreshKey ?? ''}` : null,
    fetcher,
    {
      revalidateOnFocus:    false,
      revalidateIfStale:    false,
      dedupingInterval:     5000,
    },
  );

  if (!enabled) return null;
  if (error || !data) return null;

  const row = data.usage.find(r => r.tool === tool);
  if (!row) return null;

  const pct = row.limit > 0 ? row.used / row.limit : 0;
  const atCap     = row.used >= row.limit;
  const nearCap   = !atCap && pct >= 0.8;
  const accent    = tier === 'compound' ? 'gold' : 'primary';

  // Visual treatment by state. Tokens come from globals.css /
  // tailwind.config.ts (CLAUDE.md banned hardcoded hex).
  const containerCls =
    atCap
      ? `border-amber-500/30 bg-amber-500/5 text-amber-200`
      : nearCap
        ? accent === 'gold'
          ? `border-gold/30 bg-gold/5 text-gold`
          : `border-primary/30 bg-primary/5 text-primary`
        : `border-border bg-card text-muted-foreground`;

  const barFillCls =
    atCap
      ? 'bg-amber-500'
      : nearCap
        ? accent === 'gold' ? 'bg-gold' : 'bg-primary'
        : 'bg-muted-foreground/40';

  const reset = formatResetDate(row.resetsAt);

  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs flex flex-col gap-1.5 ${containerCls} ${className ?? ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">
          {atCap ? (
            <>Cap reached — <span className="font-semibold">{row.used} / {row.limit}</span> {row.toolLabel} calls this cycle</>
          ) : (
            <>{row.used} of {row.limit} {row.toolLabel} calls used this cycle</>
          )}
        </span>
        <span className="text-[10px] uppercase tracking-wider opacity-80">
          Resets {reset}
        </span>
      </div>

      <div className="h-1 w-full rounded-full bg-foreground/10 overflow-hidden">
        <div
          className={`h-full ${barFillCls} transition-[width]`}
          style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }}
        />
      </div>

      {atCap && (
        <div className="mt-1 flex items-center justify-between gap-2">
          <span>
            {tier === 'execute'
              ? 'Upgrade to Compound for higher limits.'
              : 'Your quota will refresh at the start of your next billing cycle.'}
          </span>
          {tier === 'execute' && (
            <Link
              href="/#pricing"
              className="inline-flex items-center gap-1 font-semibold text-amber-100 underline-offset-2 hover:underline"
            >
              <Sparkles className="size-3" aria-hidden="true" />
              Upgrade
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
