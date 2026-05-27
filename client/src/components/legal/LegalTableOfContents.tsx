'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, List } from 'lucide-react';
import type { TocEntry } from '@/lib/legal/extract-toc';

/**
 * LegalTableOfContents — sticky section index, Institute treatment.
 *
 *  - Desktop (lg+): sticky sidebar that stays in view as the reader
 *    scrolls; the active section gets an accent left border and
 *    --accent text colour.
 *  - Mobile (< lg): collapsible "Jump to section" hairline dropdown
 *    above the body content.
 *
 * Entries are rendered as links to the heading IDs emitted by
 * rehype-slug.
 */
export default function LegalTableOfContents({
  entries,
}: {
  entries: TocEntry[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (entries.length === 0) return;
    const observer = new IntersectionObserver(
      (observerEntries) => {
        for (const entry of observerEntries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      {
        rootMargin: '-10% 0px -75% 0px',
        threshold: 0,
      },
    );
    for (const { id } of entries) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <>
      {/* Mobile toggle */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="toc-mobile-list"
          className="flex w-full items-center justify-between border border-rule px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-rule-strong hover:text-fg"
        >
          <span className="inline-flex items-center gap-2">
            <List aria-hidden="true" className="size-4 text-accent" />
            Jump to section
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`size-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {mobileOpen && (
          <ol
            id="toc-mobile-list"
            className="mt-2 border border-rule"
          >
            {entries.map((entry, i) => (
              <li
                key={entry.id}
                className="border-b border-rule last:border-b-0"
              >
                <a
                  href={`#${entry.id}`}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-4 py-2.5 text-[13px] transition-colors ${
                    activeId === entry.id
                      ? 'bg-bg-2 text-accent'
                      : 'text-fg-2 hover:bg-bg-2 hover:text-fg'
                  }`}
                >
                  <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {entry.title}
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Desktop sticky sidebar */}
      <nav
        aria-label="Section index"
        className="hidden lg:sticky lg:top-24 lg:block lg:self-start"
      >
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          On this page
        </p>
        <ol className="border-l border-rule">
          {entries.map((entry, i) => {
            const isActive = activeId === entry.id;
            return (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  className={`-ml-px block border-l-2 px-4 py-2 text-[13px] transition-colors ${
                    isActive
                      ? 'border-accent text-accent'
                      : 'border-transparent text-fg-2 hover:border-rule-strong hover:text-fg'
                  }`}
                >
                  <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {entry.title}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
