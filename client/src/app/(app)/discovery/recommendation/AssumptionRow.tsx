// src/app/(app)/discovery/recommendation/AssumptionRow.tsx
'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { ThumbsDown } from 'lucide-react';

interface AssumptionRowProps {
  text:      string;
  path:      string;
  reasoning: string;
}

/**
 * AssumptionRow
 *
 * Renders a single assumption with an inline flag button.
 * When flagged, calls /api/discovery/assumption-check and streams
 * a scoped response explaining how the recommendation changes.
 */
export function AssumptionRow({ text, path, reasoning }: AssumptionRowProps) {
  const [flagged,  setFlagged]  = useState(false);
  const [response, setResponse] = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleFlag() {
    if (flagged) return;
    setFlagged(true);
    setLoading(true);
    try {
      const res = await fetch('/api/discovery/assumption-check', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ assumption: text, path, reasoning }),
      });
      if (!res.body) { setLoading(false); return; }
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setResponse(acc);
      }
    } catch { /* non-fatal — response stays empty */ }
    setLoading(false);
  }

  return (
    <li className="flex flex-col gap-1.5">
      <div className="text-sm text-foreground/80 flex gap-2 items-start">
        <span className="text-muted-foreground mt-0.5">—</span>
        <span className="flex-1 leading-relaxed">{text}</span>
        <button
          onClick={() => { void handleFlag(); }}
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
          className="ml-4 text-xs text-muted-foreground leading-relaxed"
        >
          {loading && !response && <span className="italic">Thinking…</span>}
          {response && <p className="italic">{response}</p>}
          {!loading && (
            <a
              href="/discovery"
              className="block mt-1 underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Refine your answers →
            </a>
          )}
        </motion.div>
      )}
    </li>
  );
}
