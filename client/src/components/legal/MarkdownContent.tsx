import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import type { Components } from 'react-markdown';
import type { AnchorHTMLAttributes } from 'react';

/**
 * Custom markdown component map — Institute treatment. Every heading,
 * paragraph, list, link, and table picks up the satellite palette
 * (hairline rules, Inter Tight body, Instrument Serif accents,
 * --accent for links + lifts). Designed for /legal/{terms,privacy,
 * cookies} but generic enough for any heavy-text editorial page.
 *
 * H2 renders as a two-line chapter title: mono caps eyebrow on the
 * first line, Inter Tight 500 heading on the second, with a hairline
 * top rule. H3 is italic serif. Body is 15px / 1.65 line-height.
 */
const components: Components = {
  h1: ({ children, ...props }) => (
    <h1
      {...props}
      className="font-sans text-fg [font-size:clamp(40px,5.6vw,84px)] [font-weight:500] [line-height:0.96] [letter-spacing:-0.03em]"
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      {...props}
      className="
        group mt-16 scroll-mt-24 border-t border-rule pt-12
        font-sans text-fg [font-size:clamp(24px,2.8vw,32px)] [font-weight:500] [line-height:1.15] [letter-spacing:-0.02em]
      "
    >
      <span className="mb-2.5 block font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        Section
      </span>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      {...props}
      className="mt-10 scroll-mt-24 font-serif text-[22px] italic font-normal leading-[1.3] tracking-[-0.01em] text-fg"
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p
      {...props}
      className="mt-5 text-[15px] leading-[1.65] text-fg-2"
    >
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => (
    <strong {...props} className="font-medium text-fg">
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em {...props} className="font-serif italic text-accent">
      {children}
    </em>
  ),
  hr: () => null,
  ul: ({ children, ...props }) => (
    <ul
      {...props}
      className="
        mt-5 grid gap-2 pl-0 text-[15px] leading-[1.65] text-fg-2
        [&>li]:relative [&>li]:pl-5
        [&>li::before]:absolute [&>li::before]:left-0 [&>li::before]:top-[10px]
        [&>li::before]:h-px [&>li::before]:w-2.5 [&>li::before]:bg-accent
        [&>li::before]:content-['']
      "
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      {...props}
      className="
        mt-5 grid gap-2 pl-0 text-[15px] leading-[1.65] text-fg-2
        [counter-reset:legal-list]
        [&>li]:relative [&>li]:pl-9 [&>li]:[counter-increment:legal-list]
        [&>li::before]:absolute [&>li::before]:left-0 [&>li::before]:top-0
        [&>li::before]:content-[counter(legal-list,lower-roman)_'.']
        [&>li::before]:font-serif [&>li::before]:italic [&>li::before]:text-accent
        [&>li::before]:text-[15px] [&>li::before]:tracking-[-0.01em]
      "
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => <li {...props}>{children}</li>,
  a: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const isExternal = !!href && /^https?:\/\//.test(href);
    const targetProps = isExternal
      ? { target: '_blank' as const, rel: 'noopener noreferrer' as const }
      : {};
    return (
      <a
        href={href}
        {...targetProps}
        {...rest}
        className="text-accent underline decoration-rule-strong underline-offset-4 transition-colors hover:decoration-accent"
      >
        {children}
      </a>
    );
  },
  code: ({ children, ...props }) => (
    <code
      {...props}
      className="border border-rule bg-bg-2 px-1.5 py-0.5 font-mono text-[0.9em] text-accent"
    >
      {children}
    </code>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      {...props}
      className="mt-6 border-l-2 border-accent pl-5 font-serif text-[16px] italic leading-[1.55] text-fg-2"
    >
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="mt-6 overflow-x-auto border border-rule">
      <table
        {...props}
        className="w-full border-collapse text-left text-[14px] text-fg-2"
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead {...props} className="border-b border-rule bg-bg-2">
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody {...props} className="divide-y divide-rule">
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => <tr {...props}>{children}</tr>,
  th: ({ children, ...props }) => (
    <th
      {...props}
      className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted"
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td {...props} className="px-4 py-3 align-top leading-[1.6]">
      {children}
    </td>
  ),
};

/**
 * MarkdownContent — server component that renders a legal markdown
 * document with the Institute prose styling. Uses remark-gfm for
 * GitHub-flavoured-markdown tables and rehype-slug to emit anchor
 * IDs on every heading so the TOC links resolve.
 */
export default function MarkdownContent({ source }: { source: string }) {
  return (
    <ReactMarkdown
      components={components}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSlug]}
    >
      {source}
    </ReactMarkdown>
  );
}
