import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/satellite';
import MarkdownContent from '@/components/legal/MarkdownContent';
import LegalTableOfContents from '@/components/legal/LegalTableOfContents';
import { extractToc } from '@/lib/legal/extract-toc';
import {
  loadLegalMarkdown,
  LEGAL_DOCUMENTS,
  EFFECTIVE_DATE,
  LAST_UPDATED,
} from '@/lib/legal/load-markdown';

export const dynamic = 'force-static';

const DOC = LEGAL_DOCUMENTS.cookies;

export const metadata: Metadata = {
  title: `${DOC.title} — NeuraLaunch`,
  description: DOC.description,
  robots: { index: true, follow: true },
  openGraph: {
    title: `${DOC.title} — NeuraLaunch`,
    description: DOC.description,
    type: 'article',
    siteName: 'NeuraLaunch',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${DOC.title} — NeuraLaunch`,
    description: DOC.description,
  },
  other: {
    'article:modified_time': LAST_UPDATED,
  },
};

export default function CookiesPage() {
  const source = loadLegalMarkdown('cookies');
  const body = source
    .replace(/^#\s+.+\n+/, '')
    .replace(/^\*\*Effective Date:\*\*[^\n]*\n\*\*Last Updated:\*\*[^\n]*\n+/, '')
    .replace(/^---\n+/, '');
  const toc = extractToc(source);

  return (
    <LegalPage
      slug="cookies"
      title={DOC.title}
      effective={EFFECTIVE_DATE}
      toc={<LegalTableOfContents entries={toc} />}
    >
      <MarkdownContent source={body} />
    </LegalPage>
  );
}
