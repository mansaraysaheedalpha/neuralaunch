import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import type { Components } from 'react-markdown';
import type { AnchorHTMLAttributes } from 'react';

/**
 * Custom markdown component map. Each element picks up the legal-
 * document design system — spacing, typography, colours, borders —
 * without any ad-hoc styling in the markdown source itself.
 *
 * Table-related components wrap tables in an overflow container so
 * long tables become horizontally scrollable on narrow viewports
 * rather than breaking the layout.
 */
const components: Components = {
  h1: ({ children, ...props }) => (
    <h1
      {...props}
      className="mb-3 text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl"
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      {...props}
      className="group scroll-mt-24 border-t border-slate-800 pt-12 text-2xl font-semibold tracking-tight text-white sm:text-3xl"
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      {...props}
      className="mt-10 scroll-mt-24 text-lg font-semibold text-white sm:text-xl"
    >
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p
      {...props}
      className="mt-5 text-[17px] leading-[1.75] text-slate-300"
    >
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => (
    <strong {...props} className="font-semibold text-white">
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em {...props} className="italic text-slate-200">
      {children}
    </em>
  ),
  hr: () => (
    // The markdown sources use --- between sections. We rely on the
    // H2 border-top to do visual separation so the explicit rule
    // would be redundant. Render nothing.
    <></>
  ),
  ul: ({ children, ...props }) => (
    <ul
      {...props}
      className="mt-5 space-y-2 pl-6 text-[17px] leading-[1.75] text-slate-300 marker:text-slate-500 [&>li]:list-disc"
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      {...props}
      className="mt-5 space-y-2 pl-6 text-[17px] leading-[1.75] text-slate-300 marker:text-slate-500 [&>li]:list-decimal"
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li {...props} className="pl-1.5">
      {children}
    </li>
  ),
  a: ({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const isExternal = !!href && /^https?:\/\//.test(href);
    const isMailto = !!href && href.startsWith('mailto:');
    const isInternal = !!href && (href.startsWith('/') || href.startsWith('#'));
    const targetProps = isExternal
      ? { target: '_blank' as const, rel: 'noopener noreferrer' as const }
      : {};

    // Auto-detect bare email strings in the markdown (e.g. the
    // address in the Contact section) and wrap them as mailto links.
    // react-markdown gives us the href for explicit markdown links;
    // bare strings get handled at the source by placeholder
    // substitution + the `mailto:` protocol below.
    if (isMailto || isExternal || isInternal) {
      return (
        <a
          href={href}
          {...targetProps}
          {...rest}
          className="font-medium text-primary underline-offset-4 transition-colors hover:text-blue-700 hover:underline focus:outline-none focus-visible:underline"
        >
          {children}
        </a>
      );
    }

    return (
      <a
        href={href}
        {...rest}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {children}
      </a>
    );
  },
  code: ({ children, ...props }) => (
    <code
      {...props}
      className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[0.9em] text-gold"
    >
      {children}
    </code>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      {...props}
      className="mt-6 border-l-2 border-gold bg-gold/5 px-5 py-3 italic text-slate-300"
    >
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="mt-6 overflow-x-auto rounded-lg border border-slate-800">
      <table
        {...props}
        className="w-full border-collapse text-left text-sm text-slate-300"
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead {...props} className="bg-primary/10 text-white">
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody {...props} className="divide-y divide-slate-800">
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => <tr {...props}>{children}</tr>,
  th: ({ children, ...props }) => (
    <th
      {...props}
      className="border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td {...props} className="px-4 py-3 align-top leading-relaxed">
      {children}
    </td>
  ),
};

/**
 * MarkdownContent — server component that renders a legal markdown
 * document. Uses remark-gfm for GitHub-flavoured-markdown tables
 * and rehype-slug to emit anchor IDs on every heading so the TOC
 * links resolve.
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
