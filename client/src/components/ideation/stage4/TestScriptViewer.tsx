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
 *
 * TODO(copy): empty-state ("generate the script"), generating-state
 * label, in-script preamble framing all need product-voice review.
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
      <div className="rounded-md border border-dashed border-border px-3 py-4 text-center">
        {/* TODO(copy): empty-state label */}
        <p className="text-xs text-muted-foreground mb-3">
          No test script generated yet. Generate one to start engaging with real communities.
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
        <h5 className="text-xs font-semibold text-foreground mb-1">Suggested platforms</h5>
        <ul className="flex flex-wrap gap-1.5">
          {script.platforms.map((p, i) => (
            <li key={i} className="rounded-full bg-card/60 px-2 py-0.5 text-xs text-foreground">
              {p}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="flex items-center justify-between mb-1">
          <h5 className="text-xs font-semibold text-foreground">Post wording</h5>
          <button
            type="button"
            onClick={() => void handleCopy(script.postWording, 'post')}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            aria-label="Copy post wording"
          >
            {copied === 'post' ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied === 'post' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="whitespace-pre-wrap rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground leading-relaxed">
          {script.postWording}
        </p>
      </section>

      <section>
        <h5 className="text-xs font-semibold text-foreground mb-1">Follow-up questions</h5>
        <ul className="space-y-1">
          {script.questionsToAsk.map((q, i) => (
            <li key={i} className="flex items-start justify-between gap-2 rounded-md border border-border bg-card/30 px-2 py-1.5 text-sm">
              <span className="text-foreground">{q}</span>
              <button
                type="button"
                onClick={() => void handleCopy(q, `q${i}`)}
                className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
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
