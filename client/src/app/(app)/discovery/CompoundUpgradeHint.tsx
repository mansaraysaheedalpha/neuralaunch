'use client';
// src/app/(app)/discovery/CompoundUpgradeHint.tsx
//
// Surfaced on /discovery when an Execute-tier founder is about to
// start a new discovery session AND already has at least one paused
// or completed venture in their history. The signal is "this person
// is about to start a second direction" — a teachable moment to
// remind them Compound exists, without blocking the path forward.
//
// Dismiss-once-per-session via sessionStorage: closing the hint hides
// it for the rest of the tab's lifetime, but reopens on the next
// fresh tab so the founder doesn't permanently lose the option.
//
// Reads sessionStorage via useSyncExternalStore — the React-blessed
// way to bridge external (non-React) state without tripping the
// react-hooks/set-state-in-effect rule. Module-scoped subscribers
// + setSnapshot are how the dismiss button triggers a re-render in
// the same tab (the native 'storage' event only fires across tabs).

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X } from 'lucide-react';

const SESSION_KEY = 'neuralaunch.compound-hint-dismissed';

const subscribers = new Set<() => void>();
function notify() {
  for (const fn of subscribers) fn();
}
function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}
function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(SESSION_KEY) === '1';
}
function getServerSnapshot(): boolean {
  // SSR — never render the banner on the server. The client hydrates
  // with the actual sessionStorage value on the first paint.
  return true;
}

export function CompoundUpgradeHint() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function handleDismiss() {
    window.sessionStorage.setItem(SESSION_KEY, '1');
    notify();
  }

  return (
    <AnimatePresence initial={false}>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="mx-auto w-full max-w-2xl px-4 pt-3"
        >
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 flex items-start gap-3">
            <Sparkles className="size-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 flex flex-col gap-2">
              <p className="text-[12px] font-semibold text-foreground leading-tight">
                Starting another direction?
              </p>
              <p className="text-[11px] text-foreground/80 leading-relaxed">
                You&apos;re on Execute — one venture at a time, with up to 2
                paused on the side. If you keep taking on new directions
                while old ones sit, Compound runs <span className="font-medium">3 ventures in parallel</span> with
                shared learning across them, so each new cycle gets sharper
                from what the others taught.
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  See Compound
                </Link>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  Continue with Execute
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss upgrade hint"
              className="shrink-0 rounded-md p-0.5 text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
