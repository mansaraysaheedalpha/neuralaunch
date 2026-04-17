'use client';

import Script from 'next/script';
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

/**
 * Minimal shape of the Paddle.js window global we actually call. The
 * CDN script defines the full API; this is enough for the app's usage
 * (environment selection, client-side init, checkout open).
 */
declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: 'sandbox' | 'production') => void };
      Initialize: (opts: { token: string }) => void;
      Checkout: {
        open: (opts: {
          items:       { priceId: string; quantity: number }[];
          customer?:   { email: string };
          customData?: Record<string, unknown>;
        }) => void;
        close?: () => void;
      };
    };
  }
}

interface PaddleContextValue {
  /** True once Paddle.js has loaded AND Initialize() has returned. */
  isReady: boolean;
}

const PaddleContext = createContext<PaddleContextValue>({ isReady: false });

export function usePaddle(): PaddleContextValue {
  return useContext(PaddleContext);
}

interface PaddleProviderProps {
  children: ReactNode;
  /** The `test_*` or `live_*` client token from NEXT_PUBLIC_PADDLE_CLIENT_TOKEN. */
  clientToken: string | undefined;
  /** `sandbox` (default) or `production`. */
  environment: 'sandbox' | 'production';
}

/**
 * Loads Paddle.js from the CDN and initialises it with our client
 * token. Exposes an `isReady` flag via context so SubscribeButton can
 * gate its onClick until the script finishes loading.
 *
 * When the client token is absent (local dev without Paddle configured)
 * the script tag is not rendered; isReady stays false and the
 * subscribe buttons show themselves disabled. This keeps non-billing
 * contributors unblocked locally.
 */
export function PaddleProvider({ children, clientToken, environment }: PaddleProviderProps) {
  const [isReady, setIsReady] = useState(false);

  const handleLoad = useCallback(() => {
    if (typeof window === 'undefined' || !window.Paddle || !clientToken) return;
    try {
      window.Paddle.Environment.set(environment);
      window.Paddle.Initialize({ token: clientToken });
      setIsReady(true);
    } catch {
      // If initialisation fails the UI simply stays in the
      // non-ready state — better than a blank page in the rare
      // case Paddle's CDN serves a broken bundle.
      setIsReady(false);
    }
  }, [clientToken, environment]);

  return (
    <PaddleContext.Provider value={{ isReady }}>
      {clientToken ? (
        <Script
          src="https://cdn.paddle.com/paddle/v2/paddle.js"
          strategy="afterInteractive"
          onLoad={handleLoad}
        />
      ) : null}
      {children}
    </PaddleContext.Provider>
  );
}
