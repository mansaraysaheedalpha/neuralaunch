import type { Metadata } from 'next';
import LegalDocumentPage from '@/components/legal/LegalDocumentPage';
import { loadLegalMarkdown, LEGAL_DOCUMENTS, LAST_UPDATED } from '@/lib/legal/load-markdown';

export const dynamic = 'force-static';

const DOC = LEGAL_DOCUMENTS.privacy;

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

export default function PrivacyPage() {
  const source = loadLegalMarkdown('privacy');
  return <LegalDocumentPage slug="privacy" source={source} />;
}
