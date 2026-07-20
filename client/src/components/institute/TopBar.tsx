import type { ReactNode } from 'react';

/**
 * Institute top bar.
 *
 * 56-px sticky header with a backdrop blur and a single bottom hairline.
 * Renders the brand mark (animated accent dot), a breadcrumb on the
 * left, and slots for status pills + actions on the right. Visual
 * grammar: discovery-a.html · recommendation.html · no-idea-audit.html.
 *
 * The bar is server-component-friendly — it accepts ReactNode slots so
 * the consumer can pass either static text or interactive `<Link>` /
 * `<button>` elements without forcing this primitive into a client
 * boundary.
 */

export interface BreadcrumbItem {
  /** Text shown in the breadcrumb segment. */
  label: string;
  /** Optional href — when set, the segment renders as an anchor. */
  href?: string;
  /** Paint this segment in --accent (the brand colour). */
  accent?: boolean;
  /** Mark this segment as the active one — painted in --fg. */
  current?: boolean;
}

export interface TopBarProps {
  /** Breadcrumb segments left → right. Separator is " / ". */
  crumb: BreadcrumbItem[];
  /** Right-side status slot — typically one or more <Pill> elements. */
  rightStatus?: ReactNode;
  /** Right-side action slot — anchors or buttons. */
  rightActions?: ReactNode;
  /** Optional className appended to the <header> root. */
  className?: string;
}

export function TopBar({ crumb, rightStatus, rightActions, className }: TopBarProps) {
  return (
    <header
      className={[
        'sticky top-0 z-50 flex min-h-14 max-w-full items-center justify-between gap-3 overflow-hidden',
        'border-b border-rule px-4 py-2 sm:px-9 sm:py-0',
        'font-mono text-[11px] uppercase tracking-[0.14em] text-muted',
        'backdrop-blur-md',
        // bg with ~90% opacity so the blur layer reads behind. var(--bg)
        // resolved at runtime — Tailwind's bg-bg/90 syntax does not work
        // with our raw-hex token, so we use the [color] arbitrary form.
        'bg-[color-mix(in_oklab,var(--bg)_90%,transparent)]',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-[18px]">
        <BrandMark />
        <nav aria-label="Breadcrumb" className="min-w-0 overflow-hidden">
          <ol className="flex min-w-0 items-center gap-0">
            {crumb.map((item, i) => (
              <li key={`${item.label}-${i}`} className={`${i < crumb.length - 1 ? 'hidden sm:flex' : 'flex min-w-0'} items-center`}>
                {i > 0 && (
                  <span aria-hidden="true" className="mx-2 text-muted">/</span>
                )}
                <CrumbSegment item={item} />
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {(rightStatus || rightActions) && (
        <div className="flex shrink-0 items-center gap-3 sm:gap-[22px]">
          {rightStatus}
          <span className="hidden sm:inline-flex">{rightActions}</span>
        </div>
      )}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Internal pieces                                                           */
/* -------------------------------------------------------------------------- */

function BrandMark() {
  // Solid accent circle with an inner bg disc — the institute brand
  // mark. 16px so it reads against the 11px monospace nav copy.
  return (
    <span
      aria-hidden="true"
      className="relative hidden h-4 w-4 shrink-0 rounded-full bg-accent sm:inline-block"
    >
      <span className="absolute inset-1 rounded-full bg-bg" />
    </span>
  );
}

function CrumbSegment({ item }: { item: BreadcrumbItem }) {
  const tone = item.current
    ? 'text-fg'
    : item.accent
      ? 'text-accent'
      : 'text-muted';
  const interactive = !!item.href && !item.current;

  if (interactive) {
    return (
      <a
        href={item.href}
        className={`${tone} block truncate transition-colors hover:text-fg`}
      >
        {item.label}
      </a>
    );
  }
  return (
    <span
      aria-current={item.current ? 'page' : undefined}
      className={`${tone} block truncate`}
    >
      {item.label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  <Pill> — exported from the same file because it's a TopBar-shaped         */
/*  hairline tag used in the rightStatus slot. Lifting it to its own file     */
/*  would over-engineer a 12-line primitive.                                  */
/* -------------------------------------------------------------------------- */

export interface PillProps {
  children: ReactNode;
  /** Paint with --accent border + text instead of the default --rule-strong. */
  accent?: boolean;
  className?: string;
}

export function Pill({ children, accent, className }: PillProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-1 sm:px-[10px] sm:py-[5px]',
        'border',
        accent ? 'border-accent text-accent' : 'border-rule-strong text-muted',
        'font-mono text-[9px] uppercase tracking-[0.1em] sm:text-[11px] sm:tracking-[0.14em]',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      {children}
    </span>
  );
}
