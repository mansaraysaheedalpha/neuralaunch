'use client';

import { useState } from 'react';
import { Copy, Check, Sparkles } from 'lucide-react';
import type { LayerBScript } from '@/lib/ideation/stage4-opportunities/schema';

export interface TestScriptViewerProps {
  script:        LayerBScript | null;
  generating?:   boolean;
  readOnly?:     boolean;
  /** Trigger Layer B script generation for this opportunity. */
  onGenerate?:   () => Promise<void>;
}

/**
 * Renders the founder's Layer B test-script for one opportunity.
 * Copy-to-clipboard affordances per platform + question.
 */
export function TestScriptViewer({ script, generating, readOnly, onGenerate }: TestScriptViewerProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard API can be blocked by permissions or iframe policy;
      // silent failure is the right product behaviour here (founder
      // can still hand-copy from the visible text).
    }
  };

  if (script === null) {
    return (
      <div className="flex flex-col items-start gap-3 border border-dashed border-rule px-5 py-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          No test script generated yet · generate one to get started.
        </p>
        {!readOnly && onGenerate && (
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={generating}
            className="inline-flex items-center gap-2 bg-accent px-3.5 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-bg transition-transform hover:translate-x-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0"
          >
            <Sparkles aria-hidden="true" className="size-3" />
            {generating ? 'Generating…' : 'Generate test script'}
            {!generating && <span aria-hidden="true">→</span>}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Suggested platforms
        </p>
        <ul className="flex flex-wrap gap-2">
          {script.platforms.map((p, i) => (
            <li key={i} className="border border-rule px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-fg">
              {p}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            Post wording
          </p>
          <button
            type="button"
            onClick={() => void handleCopy(script.postWording, 'post')}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-accent underline underline-offset-2 transition-opacity hover:opacity-80"
            aria-label="Copy post wording"
          >
            {copied === 'post' ? <Check aria-hidden="true" className="size-3" /> : <Copy aria-hidden="true" className="size-3" />}
            {copied === 'post' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <blockquote className="border-l-2 border-accent bg-bg px-4 py-3 font-serif text-[15px] italic leading-[1.6] text-fg whitespace-pre-wrap">
          {script.postWording}
        </blockquote>
      </section>

      <section>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          Follow-up questions
        </p>
        <ul className="flex flex-col gap-1.5">
          {script.questionsToAsk.map((q, i) => (
            <li key={i} className="flex items-start justify-between gap-3 border border-rule bg-bg px-3 py-2 text-[13px] leading-snug">
              <span className="text-fg">{q}</span>
              <button
                type="button"
                onClick={() => void handleCopy(q, `q${i}`)}
                className="shrink-0 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-accent"
                aria-label={`Copy question ${i + 1}`}
              >
                {copied === `q${i}` ? <Check aria-hidden="true" className="size-3" /> : <Copy aria-hidden="true" className="size-3" />}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {!readOnly && onGenerate && (
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={generating}
          className="self-start inline-flex items-center gap-2 border border-rule-strong px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <Sparkles aria-hidden="true" className="size-3" />
          {generating ? 'Regenerating…' : 'Regenerate script'}
        </button>
      )}
    </div>
  );
}
