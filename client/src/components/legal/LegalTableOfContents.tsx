'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, List } from 'lucide-react';
import type { TocEntry } from '@/lib/legal/extract-toc';

/**
 * LegalTableOfContents — two surfaces:
 *
 *  - Desktop (lg+): sticky sidebar that stays in view as the reader
 *    scrolls, highlighting the active section via IntersectionObserver.
 *  - Mobile (< lg): collapsible dropdown at the top of the body
 *    content. Tapping the label toggles the list. Tapping an entry
 *    scrolls to the section and auto-collapses the list.
 *
 * Entries are rendered as links to the heading IDs emitted by
 * rehype-slug. Smooth scrolling is handled by the `html { scroll-
 * behavior: smooth }` rule set on the root container.
 */
export default function LegalTableOfContents({
  entries,
}: {
  entries: TocEntry[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Mark whichever section is currently in view. We use a viewport
  // margin pinned near the top so only the section the reader is
  // actively on is highlighted.
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
        // Trigger when heading is in the top 25% of the viewport
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
      {/* Mobile toggle — shown below the document header, above the body */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="toc-mobile-list"
          className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-navy-900 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-slate-700 hover:bg-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="inline-flex items-center gap-2">
            <List className="h-4 w-4 text-primary" aria-hidden="true" />
            Jump to section
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${
              mobileOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
        {mobileOpen && (
          <ol
            id="toc-mobile-list"
            className="mt-2 space-y-0.5 rounded-lg border border-slate-800 bg-navy-900 p-2"
          >
            {entries.map((entry, i) => (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  onClick={() => setMobileOpen(false)}
                  className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                    activeId === entry.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className="mr-2 text-xs text-slate-300">
                    {i + 1}.
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
        aria-label="Table of contents"
        className="hidden lg:sticky lg:top-24 lg:block lg:self-start"
      >
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-300">
          On this page
        </p>
        <ol className="space-y-1 border-l border-slate-800">
          {entries.map((entry, i) => {
            const isActive = activeId === entry.id;
            return (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  className={`-ml-px block border-l-2 px-4 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  <span className="mr-1.5 text-xs text-slate-300">
                    {i + 1}.
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
