'use client';

import { useState, useTransition } from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import { generatePortalLink } from '@/app/actions/billing';

interface BillingSectionProps {
  tier:             'free' | 'execute' | 'compound';
  status:           string;
  isFoundingMember: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  hasBillingProfile: boolean;
}

const TIER_LABEL: Record<BillingSectionProps['tier'], string> = {
  free:     'Free',
  execute:  'Execute',
  compound: 'Compound',
};

/**
 * Settings → Billing card. Shows the current tier, founding-member
 * badge when applicable, dunning / cancel banners when status is not
 * "active-and-clean", and a button that calls the generatePortalLink
 * server action and redirects to the Paddle-hosted portal.
 *
 * The portal link is minted per click — never cached — so expired
 * links never reach the browser.
 */
export function BillingSection({
  tier,
  status,
  isFoundingMember,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  hasBillingProfile,
}: BillingSectionProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleManage = () => {
    setError(null);
    startTransition(async () => {
      const result = await generatePortalLink();
      if (result.ok) {
        window.location.href = result.url;
        return;
      }
      if (result.reason === 'no-billing-profile') {
        setError('No billing profile yet — complete a checkout to manage your subscription.');
      } else if (result.reason === 'unauthorised') {
        setError('Please sign in again.');
      } else {
        setError('Could not open the billing portal. Try again in a moment.');
      }
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {TIER_LABEL[tier]} tier
            </h3>
            {isFoundingMember && (
              <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[11px] font-semibold text-gold">
                <Sparkles className="size-3" aria-hidden="true" />
                Founding member
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Status: <span className="font-medium text-foreground">{status}</span>
            {currentPeriodEnd && (tier !== 'free') && (
              <>
                {' · '}
                {cancelAtPeriodEnd ? 'Ends' : 'Renews'}{' '}
                {new Date(currentPeriodEnd).toLocaleDateString()}
              </>
            )}
          </p>
        </div>
      </div>

      {status === 'past_due' && (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          Payment failed on your last renewal. Update your card in the portal to keep your subscription active.
        </p>
      )}
      {cancelAtPeriodEnd && (
        <p className="mt-3 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300">
          Your subscription is scheduled to end on {currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString() : 'the current period end'}. You can resume from the portal before then.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleManage}
          disabled={!hasBillingProfile || isPending}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-transparent px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-slate-500 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950"
        >
          {isPending ? 'Opening portal…' : 'Manage billing'}
          <ExternalLink className="size-4" aria-hidden="true" />
        </button>
        {!hasBillingProfile && (
          <p className="text-[11px] text-muted-foreground">
            Complete a paid checkout to unlock billing management.
          </p>
        )}
        {error && (
          <p className="text-[11px] text-amber-300">{error}</p>
        )}
      </div>
    </div>
  );
}
