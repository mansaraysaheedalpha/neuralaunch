'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { usePaddle } from './PaddleProvider';

type SubscribeTierName = 'Execute' | 'Compound';

interface SubscribeButtonProps {
  /** The Paddle price id (standard or hidden founding rate) to check out. */
  priceId:     string;
  /** Display tier name, used in button label and stamped into customData. */
  tierName:    SubscribeTierName;
  /** Optional override for the button label. */
  label?:      string;
  /** Tailwind utility string for button styling — tier-specific in PricingSection. */
  className?:  string;
}

/**
 * Opens the Paddle.js overlay checkout for a given price.
 *
 * The customData.internalUserId passthrough is the bridge the webhook
 * uses to reconcile the Paddle subscription back to our User row —
 * without it, subscription.created would fail to find a user and the
 * row would never be written.
 *
 * Unauthenticated clicks redirect to /signin with a returnTo param
 * pointing at the pricing section so the user lands back here after
 * sign-in and can retry.
 */
export function SubscribeButton({
  priceId,
  tierName,
  label,
  className,
}: SubscribeButtonProps) {
  const { data: session, status } = useSession();
  const { isReady }               = usePaddle();
  const router                    = useRouter();

  const handleClick = () => {
    if (status === 'loading') return;

    if (!session?.user?.id || !session.user.email) {
      router.push(`/signin?returnTo=${encodeURIComponent('/#pricing')}`);
      return;
    }

    if (typeof window === 'undefined' || !window.Paddle || !isReady) {
      // Paddle.js has not finished loading. The disabled state below
      // prevents this path in practice but we double-check at the
      // boundary so a mis-timed click does nothing rather than crashes.
      return;
    }

    window.Paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: { email: session.user.email },
      customData: {
        internalUserId: session.user.id,
        originTier:     tierName,
      },
    });
  };

  const disabled = status === 'loading' || (!!session?.user?.id && !isReady);
  const buttonLabel = label ?? `Start with ${tierName}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={
        className ??
        'inline-flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 bg-primary text-white hover:bg-blue-700 focus-visible:ring-primary disabled:opacity-60 disabled:cursor-not-allowed'
      }
    >
      {buttonLabel}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
