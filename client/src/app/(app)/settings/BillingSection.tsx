'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

// SessionStorage key — cleared once we've rewritten the URL to include
// billing_action=canceled. Survives a round-trip to the Paddle portal
// because sessionStorage is per-origin-per-tab, and the portal is on a
// different origin so it cannot read or clear it.
const BILLING_RETURN_FLAG = 'nl:billing-returning';
const BILLING_RETURN_TTL_MS = 30 * 60 * 1000;

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const billingAction = searchParams?.get('billing_action');

  // Paddle's customer portal API does not support a merchant return
  // URL, so we cannot round-trip a query param through Paddle's
  // hosted UI. Instead we drop a sessionStorage breadcrumb when the
  // user clicks Manage Billing, and on re-render of this component
  // (which happens when they navigate back to /settings) we detect
  // the breadcrumb and add ?billing_action=canceled to the URL so
  // the confirmation banner renders.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (billingAction === 'canceled') return;
    const raw = window.sessionStorage.getItem(BILLING_RETURN_FLAG);
    if (!raw) return;
    const ts = Number(raw);
    window.sessionStorage.removeItem(BILLING_RETURN_FLAG);
    if (!Number.isFinite(ts) || Date.now() - ts > BILLING_RETURN_TTL_MS) return;
    router.replace('/settings?billing_action=canceled');
  }, [billingAction, router]);

  const handleManage = () => {
    setError(null);
    startTransition(async () => {
      const result = await generatePortalLink();
      if (result.ok) {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(BILLING_RETURN_FLAG, String(Date.now()));
        }
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

  const showReturnConfirmation =
    billingAction === 'canceled' && cancelAtPeriodEnd && tier !== 'free';

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

      {showReturnConfirmation && (
        <p className="mt-3 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
          Your cancellation is scheduled for {currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString() : 'the current period end'}. You can resume anytime from billing.
        </p>
      )}
      {status === 'past_due' && (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          Payment failed on your last renewal — paid features are temporarily suspended while we retry. Update your card in the portal to restore access.
        </p>
      )}
      {status === 'paused' && (
        <p className="mt-3 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300">
          Your subscription is paused. Resume in the billing portal to restore access.
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
        {!hasBillingProfile && tier === 'free' && (
          <p className="text-[11px] text-muted-foreground">
            Complete a paid checkout to unlock billing management.
          </p>
        )}
        {!hasBillingProfile && tier !== 'free' && (
          <p className="text-[11px] text-amber-300">
            Your billing profile couldn&apos;t be located. If you recently subscribed, please contact support at <a href="mailto:info@tabempa.com" className="underline">info@tabempa.com</a>. If you&apos;re testing with a dev-bypass subscription, this is expected.
          </p>
        )}
        {error && (
          <p className="text-[11px] text-amber-300">{error}</p>
        )}
      </div>
    </div>
  );
}
