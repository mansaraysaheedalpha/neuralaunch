'use client';
// src/app/(app)/discovery/ArchetypePicker.tsx
//
// Institute archetype picker — six-row ledger that routes the founder
// into the right pipeline. Rebuilt against archetype.html. Each row's
// destination + status + visualisation comes from
// src/lib/archetype-status.ts; this file is render only.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ARCHETYPES, type ArchetypeDefinition } from '@/lib/archetype-status';

interface ArchetypePickerProps {
  firstName: string;
}

export function ArchetypePicker({ firstName }: ArchetypePickerProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Hold the keyboard-press flash for 240ms before navigating — same
  // micro-affordance archetype.html shows (the row briefly takes the
  // accent vertical-bar treatment).
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve destination per archetype. router.push handles client-side
  // navigation for in-app routes; the Stuck + No-Idea routes are
  // server pages that take over on landing.
  const route = (arc: ArchetypeDefinition) => {
    if (pendingId) return;
    setPendingId(arc.id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      router.push(arc.destination);
    }, 240);
  };

  // Keyboard 1-6 → archetype at that index. Ignore when a modifier is
  // held (so Cmd+1 still cycles tabs) or when focus is inside an
  // editable element (the picker page has none today but defending
  // against the future).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const idx = Number.parseInt(e.key, 10);
      if (!Number.isFinite(idx) || idx < 1 || idx > ARCHETYPES.length) return;
      const arc = ARCHETYPES[idx - 1];
      if (!arc) return;
      e.preventDefault();
      route(arc);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
    // route is stable enough — pendingId guard inside prevents
    // double-fire, and we want a single global listener for the
    // page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-7 py-14 sm:px-12 sm:py-16 lg:px-20 lg:pb-20 lg:pt-15">
      {/* Top crumb strip */}
      <div className="mb-14 flex flex-wrap items-baseline justify-between gap-4 border-b border-rule pb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        <div>
          <span className="text-accent">Discovery</span>
          {' / '}New session{' / '}
          <span className="text-fg">Where to begin</span>
        </div>
        <div>
          <Link href="/" className="transition-colors hover:text-fg">
            ← Home
          </Link>
        </div>
      </div>

      {/* Question block */}
      <section className="mb-16 grid items-end gap-16 lg:grid-cols-[1.4fr_1fr] lg:gap-20">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            {firstName ? `Welcome back, ${firstName} · Session begins` : 'New session · Session begins'}
          </p>
          <h1 className="mt-7 font-sans text-fg [font-size:clamp(40px,6vw,84px)] [font-weight:400] [line-height:0.98] [letter-spacing:-0.025em]">
            Where are you<br />
            starting from{' '}
            <em className="font-serif italic font-normal text-accent">this time?</em>
          </h1>
          <p className="mt-7 max-w-[560px] text-[17px] leading-[1.5] text-fg-2">
            <strong className="font-medium text-fg">Each path is its own experience</strong>{' '}
            — built for the kind of stuck you actually are. The interview,
            the pacing, even the tools we&rsquo;ll reach for are different.
            Pick the one that fits; you can switch later if you&rsquo;ve
            misjudged it.
          </p>
        </div>

        <aside
          aria-label="Legend"
          className="border border-rule bg-gradient-to-b from-bg-2 to-bg px-7 py-6"
        >
          <p className="mb-3.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            Reading the page
          </p>
          <ul className="grid">
            <LegendRow swatch="built">
              <strong className="font-medium text-fg">Bespoke path</strong> ·
              pipeline built specifically for this archetype
            </LegendRow>
            <LegendRow swatch="next">
              <strong className="font-medium text-fg">In design</strong> ·
              bespoke pipeline coming next
            </LegendRow>
            <LegendRow swatch="legacy">
              <strong className="font-medium text-fg">Standard</strong> ·
              uses the shared discovery pipeline
            </LegendRow>
          </ul>
        </aside>
      </section>

      {/* Ledger */}
      <div className="border-t border-rule-strong" role="list">
        {ARCHETYPES.map((arc) => (
          <ArchetypeRow
            key={arc.id}
            arc={arc}
            flashing={pendingId === arc.id}
            onPick={() => route(arc)}
          />
        ))}
      </div>

      {/* Architecture note */}
      <aside className="mt-16 grid items-start gap-9 border border-rule bg-gradient-to-b from-bg-2 to-bg p-7 lg:grid-cols-[180px_1fr] lg:gap-12">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          <span className="mb-1.5 block text-fg">§ NOTE</span>
          Why six paths
        </div>
        <div>
          <h4 className="font-serif text-[22px] font-normal leading-[1.2] tracking-[-0.01em] text-fg">
            Different kinds of stuck need{' '}
            <em className="italic text-accent">different kinds of interview.</em>
          </h4>
          <p className="mt-3 max-w-[720px] text-[14px] leading-[1.6] text-fg-2">
            The shared discovery pipeline handles all six archetypes today —
            but a stalled founder and a graduate without an idea are not
            stuck in the same way. They need different questions in a
            different order, weighted against different priors. Path I (No
            Idea) is the first bespoke pipeline. Path II (Stuck) is in
            design. Paths III–VI will follow as we learn what each one
            actually needs.
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Tag accent>Path I · live</Tag>
            <Tag accent>Path II · in design</Tag>
            <Tag>Path III–VI · using standard</Tag>
            <Tag>Resumable</Tag>
            <Tag>Switchable</Tag>
          </div>
        </div>
      </aside>

      {/* Micro-help */}
      <div className="mt-9 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        <span>Not sure? Pick the closest — you can switch.</span>
        <span>
          Press <span className="text-fg">1 – 6</span> to choose
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row                                                                        */
/* -------------------------------------------------------------------------- */

function ArchetypeRow({
  arc,
  flashing,
  onPick,
}: {
  arc:      ArchetypeDefinition;
  flashing: boolean;
  onPick:   () => void;
}) {
  const isBuilt  = arc.status === 'built';
  const isNext   = arc.status === 'next';
  const featured = isBuilt || flashing;

  return (
    <button
      type="button"
      role="listitem"
      aria-label={`Choose: ${arc.headline} ${arc.headlineEmphasis}`}
      onClick={onPick}
      className={[
        'group relative grid w-full grid-cols-1 items-baseline gap-9 border-b border-rule px-0 py-9 text-left transition-[background,padding] duration-200 hover:bg-[linear-gradient(90deg,rgba(255,90,60,0.05),transparent_50%)] hover:pl-4 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-accent',
        'lg:grid-cols-[80px_1.3fr_1.6fr_220px_80px]',
        featured ? 'bg-[linear-gradient(90deg,rgba(255,90,60,0.04),transparent_70%)]' : '',
      ].join(' ')}
    >
      {featured && (
        <span
          aria-hidden="true"
          className="absolute -left-4 top-1/2 hidden h-[60%] w-1 -translate-y-1/2 bg-accent lg:block"
        />
      )}
      <span className="font-serif text-[44px] italic leading-[0.9] text-accent">
        {arc.roman}
      </span>
      <div>
        <h3 className="font-sans text-[clamp(22px,2.2vw,30px)] font-medium leading-[1.1] tracking-[-0.015em] text-fg">
          {arc.headline}{' '}
          <em className="font-serif italic font-normal text-accent">
            {arc.headlineEmphasis}
          </em>
        </h3>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          {arc.who}
        </p>
      </div>
      <p className="max-w-[460px] text-[15px] leading-[1.5] text-fg-2">
        {arc.leadFold && (
          <span className="font-serif italic text-fg">{arc.leadFold}</span>
        )}
        {arc.leadFold && ' '}
        {arc.body}
      </p>
      <div className="border-l border-rule pl-6">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-2">
          {arc.pathLabel}
        </p>
        <p className="mb-1.5 font-sans text-[14px] font-medium text-fg">
          {arc.pathFlow}
        </p>
        <div className="flex items-center gap-1">
          {arc.stages.segments.map((seg, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={[
                'h-[3px] flex-1',
                seg === 'acc'
                  ? 'bg-accent'
                  : seg === 'ghost'
                    ? '[background:repeating-linear-gradient(45deg,var(--rule-strong)_0_3px,transparent_3px_6px)]'
                    : 'bg-rule',
              ].join(' ')}
            />
          ))}
        </div>
        <p className="mt-2 font-mono text-[10px] tracking-[0.04em] text-muted">
          {arc.stages.est}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2.5">
        <span
          className={[
            'inline-flex items-center whitespace-nowrap border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]',
            isBuilt
              ? 'border-accent bg-accent/5 text-accent'
              : isNext
                ? 'border-accent text-accent'
                : 'border-rule-strong text-muted',
          ].join(' ')}
        >
          {arc.badgeLabel}
        </span>
        <span
          aria-hidden="true"
          className="font-sans text-[26px] text-muted transition-[color,transform] duration-200 group-hover:translate-x-2 group-hover:text-accent"
        >
          →
        </span>
      </div>
    </button>
  );
}

function LegendRow({
  swatch,
  children,
}: {
  swatch: 'built' | 'next' | 'legacy';
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[22px_1fr] items-center gap-2.5 py-2 text-[13.5px] text-fg-2">
      <span
        aria-hidden="true"
        className={[
          'size-3.5 border',
          swatch === 'built'
            ? 'border-accent bg-accent'
            : swatch === 'next'
              ? 'border-accent bg-accent/20'
              : 'border-rule-strong bg-transparent',
        ].join(' ')}
      />
      <span>{children}</span>
    </li>
  );
}

function Tag({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={[
        'border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]',
        accent ? 'border-accent text-accent' : 'border-rule text-muted',
      ].join(' ')}
    >
      {children}
    </span>
  );
}
