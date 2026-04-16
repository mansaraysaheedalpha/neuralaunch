import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import MarkdownContent from './MarkdownContent';
import LegalTableOfContents from './LegalTableOfContents';
import BackToTopButton from './BackToTopButton';
import { extractToc } from '@/lib/legal/extract-toc';
import { LEGAL_DOCUMENTS, LAST_UPDATED, type LegalSlug } from '@/lib/legal/load-markdown';

/**
 * LegalDocumentPage — server-component shell shared by /legal/terms,
 * /legal/privacy, /legal/cookies.
 *
 * Layout on desktop (lg+):
 *   [ MarketingHeader                                             ]
 *   [ Title + "Last updated"                                      ]
 *   [ TOC sidebar ] [ Body markdown                              ]
 *   [ Cross-links to the other two documents                      ]
 *   [ MarketingFooter                                             ]
 *
 * Layout on mobile (< lg):
 *   [ MarketingHeader (stacks into hamburger)                    ]
 *   [ Title + "Last updated"                                      ]
 *   [ Collapsible "Jump to section" dropdown                     ]
 *   [ Body markdown                                              ]
 *   [ Cross-links                                                 ]
 *   [ MarketingFooter                                             ]
 *
 * A floating BackToTopButton appears once the reader has scrolled
 * past the first viewport.
 */
export default function LegalDocumentPage({
  slug,
  source,
}: {
  slug: LegalSlug;
  source: string;
}) {
  const doc = LEGAL_DOCUMENTS[slug];
  const toc = extractToc(source);
  const otherDocs = (Object.keys(LEGAL_DOCUMENTS) as LegalSlug[]).filter(
    (s) => s !== slug,
  );

  // Strip the H1 (it becomes the page hero) and the "Effective /
  // Last Updated" block, since both are rendered explicitly in
  // the header below. This keeps the markdown renderer focused
  // on section content.
  const body = source
    .replace(/^#\s+.+\n+/, '')
    .replace(/^\*\*Effective Date:\*\*[^\n]*\n\*\*Last Updated:\*\*[^\n]*\n+/, '')
    .replace(/^---\n+/, '');

  return (
    <div className="min-h-screen bg-[#070F1C] text-[#F7F8FA] antialiased [scroll-behavior:smooth]">
      <MarketingHeader />

      <main className="pt-16">
        {/* Document header */}
        <header className="border-b border-slate-800 bg-gradient-to-b from-[#070F1C] via-[#0A1628] to-[#0D1E38]">
          <div className="mx-auto max-w-5xl px-4 pb-10 pt-16 sm:px-6 sm:pb-14 sm:pt-20 lg:px-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-white focus:outline-none focus-visible:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to home
            </Link>

            <p className="mt-10 text-sm font-semibold uppercase tracking-wider text-[#2563EB]">
              Legal
            </p>
            <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl">
              {doc.title}
            </h1>
            <p className="mt-4 text-sm text-slate-500">
              Last updated: <span className="text-slate-300">{LAST_UPDATED}</span>
            </p>
          </div>
        </header>

        {/* Body */}
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
            <LegalTableOfContents entries={toc} />

            <article className="mt-8 max-w-[720px] lg:mt-0">
              <MarkdownContent source={body} />

              {/* Cross-links to the other documents */}
              <div className="mt-20 border-t border-slate-800 pt-10">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Related documents
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {otherDocs.map((s) => {
                    const d = LEGAL_DOCUMENTS[s];
                    return (
                      <Link
                        key={s}
                        href={`/legal/${s}`}
                        className="group flex items-center justify-between rounded-lg border border-slate-800 bg-[#0A1628] p-5 transition-colors hover:border-[#2563EB]/40 hover:bg-[#0D1E38]"
                      >
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                            Read next
                          </p>
                          <p className="mt-1 text-base font-semibold text-white">
                            {d.title}
                          </p>
                        </div>
                        <ArrowRight
                          className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-[#2563EB]"
                          aria-hidden="true"
                        />
                      </Link>
                    );
                  })}
                </div>
              </div>
            </article>
          </div>
        </div>
      </main>

      <BackToTopButton />
      <MarketingFooter />
    </div>
  );
}
