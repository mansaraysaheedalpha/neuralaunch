'use client';

import { MicOff, ChevronDown } from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

/**
 * MicPermissionHelp — inline guidance surfaced by VoiceInputButton when
 * the browser reports microphone permission is denied.
 *
 * Chrome on Android in particular will silently return NotAllowedError
 * from getUserMedia without ever showing the native permission sheet
 * once a site has been denied (or the global default is "blocked"). The
 * bare "Microphone permission denied" string left founders with no path
 * forward — this component replaces that dead end with platform-aware
 * steps.
 *
 * Platform detection uses navigator.userAgent heuristics — good enough
 * for routing to the right set of instructions. No tracking / no
 * fingerprinting beyond the string the browser already sends on every
 * request.
 */

type Platform = 'android_chrome' | 'ios_safari' | 'ios_chromium' | 'desktop';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/Android/.test(ua)) return 'android_chrome';
  if (/iPad|iPhone|iPod/.test(ua)) {
    // iOS Chrome / Brave / Edge report CriOS/FxiOS/EdgiOS; all use WebKit
    // under the hood and share Safari's mic-permission behaviour, but
    // the settings path differs in the Chrome app shell.
    if (/CriOS|FxiOS|EdgiOS/.test(ua)) return 'ios_chromium';
    return 'ios_safari';
  }
  return 'desktop';
}

interface Step {
  title: string;
  steps: string[];
}

const INSTRUCTIONS: Record<Platform, Step[]> = {
  android_chrome: [
    {
      title: 'Step 1 — OS-level permission',
      steps: [
        'Android Settings → Apps → Chrome → Permissions → Microphone',
        'Set to Allow (or "Ask every time")',
      ],
    },
    {
      title: 'Step 2 — clear the site rule in Chrome',
      steps: [
        'Chrome → ⋮ (top right) → Settings → Site settings → Microphone',
        'Scroll to the "Blocked" section',
        'If this site is listed, tap it → Clear & reset',
        'Confirm the "Ask first" toggle at the top is ON',
      ],
    },
    {
      title: 'Step 3 — reload',
      steps: [
        'Close Chrome completely (swipe away from recent apps)',
        'Reopen and visit the site again',
        'Tap the mic button — the permission sheet slides up from the bottom',
      ],
    },
  ],
  ios_safari: [
    {
      title: 'Step 1 — site-level permission',
      steps: [
        'iOS Settings → Safari → Microphone → Ask or Allow',
      ],
    },
    {
      title: 'Step 2 — app-level permission',
      steps: [
        'iOS Settings → Privacy & Security → Microphone',
        'Make sure Safari is toggled ON',
      ],
    },
    {
      title: 'Step 3 — reload',
      steps: [
        'In Safari, pull down to refresh the page',
        'Tap the mic button — allow when prompted',
      ],
    },
  ],
  ios_chromium: [
    {
      title: 'Step 1 — in the browser',
      steps: [
        'Tap "aA" or ⋯ near the URL bar → Website Settings → Microphone → Allow',
      ],
    },
    {
      title: 'Step 2 — app-level permission',
      steps: [
        'iOS Settings → [your browser] → Microphone → Allow',
        'Also check iOS Settings → Privacy & Security → Microphone',
      ],
    },
    {
      title: 'Step 3 — reload',
      steps: ['Pull down to refresh, then tap the mic again'],
    },
  ],
  desktop: [
    {
      title: 'Unblock in the address bar',
      steps: [
        'Click the lock / tune icon on the left of the URL',
        'Set Microphone to Allow',
        'Reload the page and tap the mic button again',
      ],
    },
  ],
};

export interface MicPermissionHelpProps {
  className?: string;
}

export function MicPermissionHelp({ className }: MicPermissionHelpProps) {
  const [expanded, setExpanded] = useState(false);
  const platform = useMemo(() => detectPlatform(), []);
  const sections = INSTRUCTIONS[platform];

  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-border bg-background p-3 flex flex-col gap-2',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <MicOff className="size-4 shrink-0 text-red-500 mt-0.5" aria-hidden />
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">
            Microphone is blocked for this site
          </p>
          <p className="text-[11px] text-muted-foreground">
            Your browser is not asking for permission because it has been
            blocked previously or the default is set to deny. Here is how
            to re-enable it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-[11px] font-medium text-primary shrink-0 flex items-center gap-0.5"
          aria-expanded={expanded}
        >
          {expanded ? 'Hide' : 'Show'} steps
          <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      {expanded && (
        <ol className="flex flex-col gap-2 pl-6 mt-1">
          {sections.map((section, i) => (
            <li key={i} className="flex flex-col gap-0.5">
              <p className="text-[11px] font-semibold text-foreground">{section.title}</p>
              <ul className="flex flex-col gap-0.5 pl-3 list-disc marker:text-muted-foreground/70">
                {section.steps.map((step, j) => (
                  <li key={j} className="text-[11px] text-muted-foreground">
                    {step}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
