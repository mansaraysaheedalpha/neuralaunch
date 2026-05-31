'use client';

import { useState } from 'react';
import { Copy, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <div className="rounded-md border border-dashed border-rule px-3 py-4 text-center">
        <p className="text-xs text-muted mb-3">
          No test script generated yet. Generate one to get started.
        </p>
        {!readOnly && onGenerate && (
          <Button
            type="button"
            size="sm"
            onClick={() => void onGenerate()}
            disabled={generating}
          >
            <Sparkles className="size-3 mr-1" />
            {generating ? 'Generating…' : 'Generate test script'}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section>
        <h5 className="text-xs font-semibold text-fg mb-1">Suggested platforms</h5>
        <ul className="flex flex-wrap gap-1.5">
          {script.platforms.map((p, i) => (
            <li key={i} className="rounded-full bg-bg-2/60 px-2 py-0.5 text-xs text-fg">
              {p}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="flex items-center justify-between mb-1">
          <h5 className="text-xs font-semibold text-fg">Post wording</h5>
          <button
            type="button"
            onClick={() => void handleCopy(script.postWording, 'post')}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            aria-label="Copy post wording"
          >
            {copied === 'post' ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied === 'post' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="whitespace-pre-wrap rounded-md border border-rule bg-bg/60 px-3 py-2 text-sm text-fg leading-relaxed">
          {script.postWording}
        </p>
      </section>

      <section>
        <h5 className="text-xs font-semibold text-fg mb-1">Follow-up questions</h5>
        <ul className="space-y-1">
          {script.questionsToAsk.map((q, i) => (
            <li key={i} className="flex items-start justify-between gap-2 rounded-md border border-rule bg-bg-2/30 px-2 py-1.5 text-sm">
              <span className="text-fg">{q}</span>
              <button
                type="button"
                onClick={() => void handleCopy(q, `q${i}`)}
                className="shrink-0 inline-flex items-center gap-1 text-xs text-muted hover:text-accent"
                aria-label={`Copy question ${i + 1}`}
              >
                {copied === `q${i}` ? <Check className="size-3" /> : <Copy className="size-3" />}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {!readOnly && onGenerate && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void onGenerate()}
          disabled={generating}
        >
          <Sparkles className="size-3 mr-1" />
          {generating ? 'Regenerating…' : 'Regenerate script'}
        </Button>
      )}
    </div>
  );
}
