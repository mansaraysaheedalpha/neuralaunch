'use client';

import { useState } from 'react';

/**
 * Assumption — a single flaggable assumption row. Flagging toggles the
 * accent border + fill and reveals a `.delta` block: what the
 * recommendation changes to if this assumption is false.
 *
 * The delta is generated live by `/api/discovery/assumption-check`
 * (streamed) rather than persisted per-assumption — the codebase
 * already had that endpoint, so no `if_false_delta` schema field is
 * needed (see PR notes). The consumer supplies an `onRequestDelta`
 * callback that returns the streamed text; this keeps the component
 * transport-agnostic so a future /ventures re-read view can supply a
 * persisted delta instead.
 *
 * Reuse contract: drop into any recommendation re-read surface — pass
 * the assumption text + a delta resolver. Flag state is local.
 */
export interface AssumptionProps {
  /** The assumption text. */
  text: string;
  /**
   * Resolves the "if false" delta. Receives an onChunk callback for
   * streamed responses; resolve when complete. Throwing surfaces the
   * fallback copy.
   */
  onRequestDelta: (onChunk: (accumulated: string) => void) => Promise<void>;
}

export function Assumption({ text, onRequestDelta }: AssumptionProps) {
  const [flagged, setFlagged] = useState(false);
  const [delta, setDelta] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const toggle = () => {
    const next = !flagged;
    setFlagged(next);
    if (next && !loaded && !loading) {
      setLoading(true);
      void onRequestDelta((acc) => setDelta(acc))
        .then(() => setLoaded(true))
        .catch(() => setDelta('Could not compute the change for this assumption. Argue it in the pushback rail to explore what shifts if it is false.'))
        .finally(() => setLoading(false));
    }
  };

  return (
    <div
      className={[
        'mb-3 grid grid-cols-[1fr_auto] items-center gap-[18px] border px-[22px] py-[18px] transition-colors',
        flagged ? 'border-accent' : 'border-rule hover:border-rule-strong',
      ].join(' ')}
      style={flagged ? { background: 'rgba(255,90,60,0.05)' } : undefined}
    >
      <div className="text-[15.5px] leading-[1.55] text-fg-2">{text}</div>
      <button
        type="button"
        onClick={toggle}
        className={[
          'inline-flex items-center gap-2 whitespace-nowrap border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors',
          flagged
            ? 'border-accent text-accent'
            : 'border-rule-strong text-muted hover:border-accent hover:text-accent',
        ].join(' ')}
        style={flagged ? { background: 'rgba(255,90,60,0.10)' } : undefined}
        aria-pressed={flagged}
      >
        {flagged ? '✕ Unflag' : '⚐ Flag'}
      </button>

      {flagged && (
        <div className="col-span-2 mt-3.5 border-t border-dashed border-rule pt-3.5 text-[14.5px] leading-[1.55] text-fg-2">
          {loading && !delta ? (
            <span className="italic text-muted">Reading what changes if this is false…</span>
          ) : (
            <p>
              <b className="font-medium text-accent">If false: </b>
              {delta}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
