// src/app/(app)/discovery/recommendation/AssumptionRow.tsx
'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { ThumbsDown, ArrowRight } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface AssumptionRowProps {
  text:      string;
  path:      string;
  reasoning: string;
}

async function fetchAssumptionCheck(
  assumption:    string,
  path:          string,
  reasoning:     string,
  clarification: string | undefined,
  onChunk:       (accumulated: string) => void,
): Promise<void> {
  const res = await fetch('/api/discovery/assumption-check', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ assumption, path, reasoning, clarification }),
  });
  if (!res.body) return;
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += decoder.decode(value, { stream: true });
    onChunk(acc);
  }
}

/**
 * AssumptionRow
 *
 * Renders a single assumption with an inline flag button.
 * On flag: streams a scoped explanation of what changes if the assumption is false.
 * On "Refine your answers": shows an inline textarea for clarification,
 *   sends it to the same endpoint, and updates the response in place.
 */
export function AssumptionRow({ text, path, reasoning }: AssumptionRowProps) {
  const [flagged,        setFlagged]        = useState(false);
  const [response,       setResponse]       = useState('');
  const [loading,        setLoading]        = useState(false);
  const [showClarify,    setShowClarify]    = useState(false);
  const [clarifyText,    setClarifyText]    = useState('');
  const clarifyRef = useRef<HTMLTextAreaElement>(null);

  async function stream(clarification?: string) {
    setLoading(true);
    setResponse('');
    try {
      await fetchAssumptionCheck(text, path, reasoning, clarification, setResponse);
    } catch { /* non-fatal */ }
    setLoading(false);
  }

  function handleFlag() {
    if (flagged) return;
    setFlagged(true);
    void stream();
  }

  function handleClarifyOpen() {
    setShowClarify(true);
    setTimeout(() => clarifyRef.current?.focus(), 50);
  }

  function handleClarifySubmit() {
    const val = clarifyText.trim();
    if (!val) return;
    setShowClarify(false);
    setClarifyText('');
    void stream(val);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleClarifySubmit();
    }
  }

  return (
    <li className="flex flex-col gap-1.5">
      <div className="text-sm text-foreground/80 flex gap-2 items-start">
        <span className="text-muted-foreground mt-0.5">—</span>
        <span className="flex-1 leading-relaxed">{text}</span>
        <button
          onClick={handleFlag}
          disabled={flagged}
          title="This doesn't apply to me"
          className={`flex-shrink-0 mt-0.5 p-0.5 rounded transition-colors ${
            flagged ? 'text-destructive' : 'text-muted-foreground/30 hover:text-muted-foreground'
          }`}
        >
          <ThumbsDown className="size-3" />
        </button>
      </div>

      {flagged && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="ml-4 flex flex-col gap-2"
        >
          {loading && !response && (
            <span className="text-xs text-muted-foreground italic">Thinking…</span>
          )}
          {response && (
            <p className="text-xs text-muted-foreground italic leading-relaxed">{response}</p>
          )}

          {!loading && !showClarify && (
            <button
              onClick={handleClarifyOpen}
              className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Add more context →
            </button>
          )}

          {showClarify && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex gap-2 items-end"
            >
              <Textarea
                ref={clarifyRef}
                value={clarifyText}
                onChange={e => setClarifyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tell us more about your situation…"
                rows={2}
                className="flex-1 min-h-0 resize-none bg-muted/40 px-3 py-2 text-xs"
              />
              <button
                onClick={handleClarifySubmit}
                disabled={!clarifyText.trim()}
                className="flex-shrink-0 size-7 rounded-lg bg-muted flex items-center justify-center hover:bg-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowRight className="size-3.5" />
              </button>
            </motion.div>
          )}
        </motion.div>
      )}
    </li>
  );
}
