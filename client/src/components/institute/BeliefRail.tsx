import type { ReactNode } from 'react';

/**
 * Institute belief rail.
 *
 * Right-side panel from stage-1.html. Renders a header (eyebrow +
 * completion % + serif-italic title + meter), a stacked list of
 * "dimensions" (one per field), and a foot strip.
 *
 * Each dimension renders in two rows:
 *
 *   [roman]  Dimension name         [● captured / listening… / ○ pending]
 *            — value in monospace, indented under the name
 *
 * Generic on the field shape so the same primitive serves:
 *   • Stage 1 — four outcome dimensions
 *   • Standard Discovery — 14/15-field belief state grouped by phase
 *
 * Stages 3+ use bespoke side panels (shortlist counter, scout log,
 * etc.) — this primitive intentionally does NOT try to be everything.
 *
 * The rail collapses to display:none under 1000px. The parent owns any
 * drawer / sheet expose-it strategy below that breakpoint.
 */

export type FieldState = 'captured' | 'live' | 'pending';

export interface BeliefRailField {
  /** Stable key for React reconciliation. */
  id: string;
  /** Optional roman numeral / index (e.g. "i.") displayed before the name. */
  roman?: string;
  /** Field display name. */
  name: string;
  /**
   * Captured value — short text (e.g. "12-18 months to first real
   * income"). Rendered in monospace on its own row beneath the name.
   * Use "extracting…" for live and "— to come" for pending; the rail
   * does not impose copy.
   */
  value?: string;
  /** Field state — drives the confidence label, value tone, and pulse. */
  state: FieldState;
  /**
   * Optional confidence-label override. Defaults to "● captured" /
   * "listening…" / "○ pending" based on state. Useful when the consumer
   * wants to surface a numeric confidence ("● 0.82") instead.
   */
  confLabel?: string;
}

export interface BeliefRailGroupAccent {
  /** Right-side group label (e.g. "Complete", "3/5"). */
  text: string;
  /** Paint the label in --accent when true. */
  accent?: boolean;
}

export interface BeliefRailGroup {
  /** Section heading on the left (e.g. "I. Orientation"). Hidden when
   *  there's only one group and you don't want a section header. */
  label?: string;
  /** Optional right-side counter / status. */
  labelRight?: BeliefRailGroupAccent;
  /** Ordered list of fields under the group. */
  fields: BeliefRailField[];
}

export interface BeliefRailFootRight {
  text: string;
  /** Paint in --accent when true (e.g. "~2 turns to ready"). */
  accent?: boolean;
}

export interface BeliefRailProps {
  /** Eyebrow text — "Outcome map", "Belief state", etc. */
  eyebrow?: string;
  /**
   * Panel headline — ReactNode so the consumer can drop in an Instrument
   * Serif italic accent: <>What you're <em>aiming for</em></>
   */
  title: ReactNode;
  /** 0–100; drives the meter fill. Values outside that range clamp. */
  completionPct: number;
  /** Field groups, top to bottom. */
  groups: BeliefRailGroup[];
  /** Optional foot-strip left-side text. */
  footLeft?: string;
  /** Optional foot-strip right-side text. */
  footRight?: BeliefRailFootRight;
  /** Optional className appended to the <aside> root. */
  className?: string;
}

export function BeliefRail({
  eyebrow = 'Belief state',
  title,
  completionPct,
  groups,
  footLeft,
  footRight,
  className,
}: BeliefRailProps) {
  const pct = clamp01(completionPct);

  return (
    <aside
      aria-label={eyebrow}
      className={[
        // Hidden below 1000px; the parent decides whether to expose a
        // drawer. Tailwind's min-[1000px]: arbitrary breakpoint matches
        // the stage-1.html @media (max-width: 1000px) rule exactly.
        'hidden min-[1000px]:grid',
        'w-[360px] grid-rows-[auto_1fr_auto] overflow-hidden bg-bg',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      {/* Header */}
      <header className="border-b border-rule px-[22px] py-[18px]">
        <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          <span>{eyebrow}</span>
          <span className="text-accent">{Math.round(pct)}% complete</span>
        </div>
        <h4
          className="
            mt-2 font-serif text-[24px] italic font-normal leading-tight
            tracking-[-0.015em] text-fg
            [&_em]:text-accent
          "
        >
          {title}
        </h4>
        <div
          className="mt-3 h-1 overflow-hidden bg-rule"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div
            className="h-full bg-accent transition-[width] duration-[600ms]"
            style={{
              width: `${pct}%`,
              transitionTimingFunction: 'cubic-bezier(.2,.7,.1,1)',
            }}
          />
        </div>
      </header>

      {/* List */}
      <div className="overflow-y-auto py-2">
        {groups.map((group, i) => (
          <Group key={group.label ?? `g${i}`} group={group} />
        ))}
      </div>

      {/* Foot */}
      {(footLeft || footRight) && (
        <footer className="flex justify-between border-t border-rule px-[22px] py-3.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          <span>{footLeft}</span>
          {footRight && (
            <span className={footRight.accent ? 'text-accent' : undefined}>
              {footRight.text}
            </span>
          )}
        </footer>
      )}
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/*  Internals                                                                 */
/* -------------------------------------------------------------------------- */

function Group({ group }: { group: BeliefRailGroup }) {
  return (
    <section>
      {(group.label || group.labelRight) && (
        <div className="flex justify-between px-[22px] pb-2 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          <span>{group.label}</span>
          {group.labelRight && (
            <span className={group.labelRight.accent ? 'text-accent' : undefined}>
              {group.labelRight.text}
            </span>
          )}
        </div>
      )}
      <ul>
        {group.fields.map((field) => (
          <Dimension key={field.id} field={field} />
        ))}
      </ul>
    </section>
  );
}

function Dimension({ field }: { field: BeliefRailField }) {
  const captured = field.state === 'captured';
  const live = field.state === 'live';
  const conf = field.confLabel ?? defaultConfLabel(field.state);
  return (
    <li className="border-b border-rule px-[22px] py-[18px] last:border-b-0">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2.5">
          {field.roman && (
            <span className="font-serif text-[18px] italic text-accent tracking-[-0.01em] leading-none">
              {field.roman}
            </span>
          )}
          <span
            className={[
              'font-sans text-[14.5px] font-medium tracking-[-0.005em]',
              captured || live ? 'text-fg' : 'text-fg-2',
            ].join(' ')}
          >
            {field.name}
          </span>
        </div>
        <span
          className={[
            'font-mono text-[9px] uppercase tracking-[0.14em]',
            captured || live ? 'text-accent' : 'text-muted',
          ].join(' ')}
        >
          {conf}
        </span>
      </div>
      {field.value !== undefined && (
        <div
          className={[
            'pl-6 font-mono text-[11.5px] leading-[1.5] tracking-[0.04em]',
            captured ? 'text-fg-2'
              : live ? 'text-accent animate-pulse'
              : 'text-muted',
          ].join(' ')}
          style={live ? { animationDuration: '1.4s' } : undefined}
        >
          — {field.value}
        </div>
      )}
    </li>
  );
}

function defaultConfLabel(state: FieldState): string {
  switch (state) {
    case 'captured': return '● captured';
    case 'live':     return 'listening…';
    case 'pending':
    default:         return '○ pending';
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
