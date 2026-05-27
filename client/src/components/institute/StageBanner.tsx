'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Institute stage banner.
 *
 * One-row intro strip that names the current stage of a multi-stage
 * surface (No-Idea pipeline today, Discovery / Stuck-founder later).
 * Replaces the five near-duplicate Stage{N}Banner.tsx files that lived
 * under no-idea/[sessionId]/.
 *
 * Persistence contract — identical to the legacy Stage1Banner.tsx so the
 * dismiss UX does not regress for any in-flight session:
 *
 *   localStorage["neuralaunch:institute:banner:{sessionId}:stage{n}"]
 *     === "1"  →  dismissed
 *
 * The hook is SSR-safe: first paint returns null until useEffect has
 * resolved the dismissed flag from window.localStorage, mirroring the
 * pattern in [[stage1banner-legacy]] and ThemeSwitcher.
 */

const BANNER_KEY = (sessionId: string, stage: number) =>
  `neuralaunch:institute:banner:${sessionId}:stage${stage}`;

/* Roman numerals only need to cover stages 0–9; a tiny lookup is
   clearer than a runtime conversion and fast to read.                  */
const ROMAN: Record<number, string> = {
  0: '0',
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
  7: 'VII',
  8: 'VIII',
  9: 'IX',
};

export interface StageBannerProps {
  /** Discovery / ideation session id. Scopes the dismissed flag. */
  sessionId: string;
  /** Stage number (0–9). Roman numeral rendered in the label strip. */
  stage: number;
  /** Total stages in the pipeline — for the "STAGE I OF 5" stamp. */
  totalStages: number;
  /** Stage title — rendered in caps after the stage stamp. */
  title: string;
  /**
   * Body copy. ReactNode so callers can embed Instrument Serif italic
   * accents inline with <em>…</em> — matches the audit + Stage 1
   * reference exactly.
   */
  body: ReactNode;
  /** Default true. When false, the X-button is suppressed entirely. */
  dismissible?: boolean;
  /**
   * Forces the banner visible regardless of the persisted dismissed
   * flag. Used during the pristine-conversation state in no-idea so
   * the founder always sees the intro before the first message.
   */
  forceVisible?: boolean;
}

export function StageBanner({
  sessionId,
  stage,
  totalStages,
  title,
  body,
  dismissible = true,
  forceVisible,
}: StageBannerProps) {
  // null on the SSR pass + first client render to avoid a hydration
  // mismatch (the persisted flag is not available at SSR time). useState
  // → useEffect → setState is the canonical SSR-safe localStorage probe.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(false);
      return;
    }
    try {
      const stored = window.localStorage.getItem(BANNER_KEY(sessionId, stage));
      setDismissed(stored === '1');
    } catch {
      setDismissed(false);
    }
  }, [sessionId, stage]);

  const dismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(BANNER_KEY(sessionId, stage), '1');
      } catch {
        /* private mode / quota — banner re-shows next time */
      }
    }
  };

  if (dismissed === null) return null;
  if (dismissed && !forceVisible) return null;

  const stamp = `STAGE ${ROMAN[stage] ?? String(stage)} OF ${ROMAN[totalStages] ?? String(totalStages)} · ${title.toUpperCase()}`;

  return (
    // Bordered card (not full-width strip) — sits inside the stage
    // column the way `.banner` does in stage-1.html. Serif italic body
    // by default; <em> flips the emphasised phrase out to sans medium
    // --fg — the inverse of the typical inline-italic pattern, matching
    // the institute grammar from the audit.
    <div className="grid grid-cols-[1fr_auto] items-center gap-6 border border-rule bg-bg-2 px-[18px] py-3.5">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          {stamp}
        </p>
        <p
          className="
            mt-1 max-w-[560px]
            font-serif text-[15px] italic leading-[1.4] text-fg-2
            [&_em]:not-italic [&_em]:font-sans [&_em]:font-medium [&_em]:text-fg
          "
        >
          {body}
        </p>
      </div>

      {dismissible && (
        <button
          type="button"
          onClick={dismiss}
          aria-label={`Dismiss stage ${stage} intro`}
          className="
            inline-flex shrink-0 items-center gap-1.5
            border border-rule-strong px-2.5 py-1.5
            font-mono text-[10px] uppercase tracking-[0.14em] text-muted
            transition-colors
            hover:border-accent hover:text-accent
          "
        >
          <X aria-hidden="true" className="size-3" />
          Dismiss
        </button>
      )}
    </div>
  );
}
