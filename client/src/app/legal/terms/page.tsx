import type { Metadata } from 'next';
import LegalDocumentPage from '@/components/legal/LegalDocumentPage';
import { loadLegalMarkdown, LEGAL_DOCUMENTS, LAST_UPDATED } from '@/lib/legal/load-markdown';

// Statically generated at build time — legal pages change rarely.
export const dynamic = 'force-static';

const DOC = LEGAL_DOCUMENTS.terms;

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

export default function TermsPage() {
  const source = loadLegalMarkdown('terms');
  return <LegalDocumentPage slug="terms" source={source} />;
}
