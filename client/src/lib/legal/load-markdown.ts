import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Legal-document configuration — one row per slug we render at
 * /legal/<slug>. Keeps the list of facts each page needs in one
 * place so the page files stay trivial.
 */
export const LEGAL_DOCUMENTS = {
  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    filename: 'terms.md',
    description:
      'The Terms of Service that govern your access to and use of NeuraLaunch, a product of Tabempa Engineering Limited.',
  },
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    filename: 'privacy.md',
    description:
      'How Tabempa Engineering Limited collects, uses, stores, shares, and protects your personal information when you use NeuraLaunch.',
  },
  cookies: {
    slug: 'cookies',
    title: 'Cookie Policy',
    filename: 'cookies.md',
    description:
      'How NeuraLaunch uses cookies and similar technologies. We do not use advertising or cross-site tracking cookies.',
  },
} as const;

export type LegalSlug = keyof typeof LEGAL_DOCUMENTS;

/**
 * Canonical effective date for the current version of all three
 * legal documents. Single source of truth — update here to
 * re-date every document at once.
 *
 * Derivation: next week Friday from 2026-04-16 (Thursday) is
 * Friday, 24 April 2026. When the docs are updated, both this
 * string and the `LAST_UPDATED` below should be refreshed.
 */
export const EFFECTIVE_DATE = '24 April 2026';
export const LAST_UPDATED = '24 April 2026';

/** Support email used in mailto links throughout the legal docs. */
export const SUPPORT_EMAIL = 'info@tabempa.com';

/**
 * Locations of our speech-to-text and text-to-speech providers.
 * Placeholder-resolved at render time so the Privacy Policy
 * tables show a concrete country rather than a bracketed token.
 */
const SPEECH_PROVIDER_LOCATION = 'United States';

/**
 * Load the markdown source for a legal document, with every
 * placeholder substituted. Runs at render time (server
 * component) — the results are cached by Next.js static
 * generation so the file system is not hit on every request.
 */
export function loadLegalMarkdown(slug: LegalSlug): string {
  const { filename } = LEGAL_DOCUMENTS[slug];
  const filePath = path.join(
    process.cwd(),
    'src',
    'content',
    'legal',
    filename,
  );
  const raw = fs.readFileSync(filePath, 'utf8');

  // Placeholder substitutions. Every replacement is global so the
  // same token in multiple spots (header, footer, section bodies)
  // all get filled in.
  return raw
    .replaceAll('[support email]', SUPPORT_EMAIL)
    .replaceAll(
      '[Next week Friday Date(You the agent do the calculution)]',
      EFFECTIVE_DATE,
    )
    .replaceAll('[Insert Date]', EFFECTIVE_DATE)
    .replaceAll('[Provider location]', SPEECH_PROVIDER_LOCATION);
}
