import Link from "next/link";
import type { ReactNode } from "react";
import { EditorialPage } from "./EditorialPage";
import { LEGAL_DOCUMENTS, type LegalSlug } from "@/lib/legal/load-markdown";

/**
 * LegalPage — Institute shell for /legal/{terms,privacy,cookies}.
 *
 * Shared hero ("Legal · Document NN" + title + effective date), a
 * two-column body (left: section index, right: prose), and a footer
 * strip linking between the three documents. The MarkdownContent /
 * TOC components are passed in as children so the page can keep
 * using react-markdown without this primitive owning the renderer.
 */

export interface LegalPageProps {
  slug: LegalSlug;
  /** Document title — e.g. "Terms of Service". */
  title: string;
  /** "Effective DD month YYYY" — rendered in mono caps under the title. */
  effective: string;
  /** Optional TOC sidebar (lg+) — passed in by the page. */
  toc?: ReactNode;
  /** The rendered markdown content. */
  children: ReactNode;
}

const LEGAL_DOC_INDEX: LegalSlug[] = ["terms", "privacy", "cookies"];

export function LegalPage({ slug, title, effective, toc, children }: LegalPageProps) {
  const idx = LEGAL_DOC_INDEX.indexOf(slug);
  const docNumber = idx === -1 ? "?" : String(idx + 1).padStart(2, "0");

  return (
    <EditorialPage>
      {/* Hero — mono stamp + title + effective date. Single-column;
          legal pages don't need a standfirst column rule. */}
      <section className="relative border-b border-rule">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(700px 320px at 25% 30%, rgba(255,90,60,0.10), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-[1320px] px-6 pb-16 pt-28 sm:px-10 lg:pb-20 lg:pt-32">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
            Legal · Document {docNumber}
          </p>
          <h1 className="mt-8 font-sans text-fg [font-size:clamp(40px,5.6vw,84px)] [font-weight:500] [line-height:0.96] [letter-spacing:-0.03em]">
            {title}
          </h1>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Effective · {effective}
          </p>
        </div>
      </section>

      {/* Body — two-column at lg+, single column below. */}
      <section className="border-b border-rule">
        <div className="mx-auto max-w-[1320px] px-6 py-16 sm:px-10 lg:py-24">
          <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
            {toc}
            <article className="max-w-[760px]">{children}</article>
          </div>
        </div>
      </section>

      {/* Footer strip — three mono links to the three documents,
          current page rendered non-link. */}
      <section className="border-b border-rule">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-4 px-6 py-10 sm:px-10 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          <span>Legal documents</span>
          <nav className="flex flex-wrap items-center gap-6">
            {LEGAL_DOC_INDEX.map((s) => {
              const doc = LEGAL_DOCUMENTS[s];
              const active = s === slug;
              return active ? (
                <span key={s} className="text-accent">
                  {doc.title}
                </span>
              ) : (
                <Link
                  key={s}
                  href={`/legal/${s}`}
                  className="transition-colors hover:text-fg"
                >
                  {doc.title}
                </Link>
              );
            })}
          </nav>
        </div>
      </section>
    </EditorialPage>
  );
}
