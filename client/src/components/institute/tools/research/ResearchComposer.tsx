'use client';
// src/components/institute/tools/research/ResearchComposer.tsx
//
// Left-column query composer: serif italic textarea inside a hairline
// "query box", an optional sans scope-hint input below a thin rule,
// then the run row (mono "Run ⌘ ↵" hint + accent Run button), and an
// example block that hides once research starts. Voice input mounts
// in via the existing VoiceInputButton when the tier permits.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import toast from 'react-hot-toast';
import { VoiceInputButton } from '@/components/ui/VoiceInputButton';
import { canUseVoiceMode, useVoiceTier } from '@/lib/voice/client-tier';
import { trackVoiceEvent } from '@/lib/voice/analytics';

export interface ResearchComposerProps {
  /** Pre-fill the query — e.g. when Packager hands off, or when the
   *  founder picks an example. */
  initialQuery?:   string;
  /** Fires when the founder commits a query (Run button or ⌘+Enter). */
  onSubmit:        (query: string, scopeHint: string) => void;
  /** Plain text — venture-aware examples surface from the page when
   *  it has session context. Fall back to generic suggestions. */
  examples?:       string[];
  /** Hide the example block — set after the first run starts. */
  hideExamples?:   boolean;
  /** Whether the run is disabled (busy / mid-flight). */
  busy?:           boolean;
}

const DEFAULT_EXAMPLES = [
  'Who are the existing players serving this market, and how do they price?',
  'What regulations or licences govern this kind of service in my geography?',
  'What is the realistic addressable market for a paid service in this niche?',
];

export function ResearchComposer({
  initialQuery,
  onSubmit,
  examples,
  hideExamples,
  busy,
}: ResearchComposerProps) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [scope, setScope] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync if parent supplies a query after mount (e.g. packager handoff
  // resolves async).
  useEffect(() => {
    if (initialQuery && query === '') setQuery(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // Auto-grow the textarea to fit content (min height set via class).
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(ta.scrollHeight, 96)}px`;
  }, [query]);

  function handleRun() {
    const q = query.trim();
    if (q.length === 0 || busy) return;
    onSubmit(q, scope.trim());
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // ⌘/Ctrl + Enter runs research. Plain Enter inserts a newline so
    // the serif composer feels like writing, not submitting a form.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleRun();
    }
  }

  /* ---- voice ---- */
  const voiceEnabled = canUseVoiceMode(useVoiceTier());
  const handleVoiceTranscription = (text: string) => {
    if (!text.trim()) return;
    setQuery(prev => prev.trim().length > 0 ? `${prev.trim()} ${text}` : text);
    trackVoiceEvent('voice_transcribed', { surface: 'research' });
  };
  const handleVoiceError = (message: string) => {
    trackVoiceEvent('voice_error', { surface: 'research', errorMessage: message });
    toast.error(message);
  };

  const showExamples = !hideExamples && query.trim().length === 0;
  const list = examples && examples.length > 0 ? examples : DEFAULT_EXAMPLES;

  return (
    <div className="flex flex-col gap-8">
      <div className="border border-rule bg-bg-2 px-6 py-5 transition-colors focus-within:border-accent">
        <textarea
          ref={taRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          disabled={busy}
          placeholder="What do you want to know? Ask the way you'd ask a sharp analyst — plainly."
          className="block w-full resize-none border-0 bg-transparent p-0 font-serif text-[24px] italic leading-[1.35] text-fg placeholder:text-muted placeholder:italic focus:outline-none disabled:opacity-60"
          rows={3}
          style={{ minHeight: 96 }}
        />

        {/* Optional scope hint */}
        <div className="mt-4 border-t border-rule pt-4">
          <label className="block">
            <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-2">
              Scope hint · optional
            </span>
            <input
              type="text"
              value={scope}
              onChange={e => setScope(e.target.value)}
              disabled={busy}
              placeholder="e.g. focus on 2023–2025 regulation, [authority name]"
              className="mt-1 block w-full border-0 bg-transparent p-0 font-sans text-[14px] text-fg-2 placeholder:text-muted focus:outline-none disabled:opacity-60"
            />
          </label>
        </div>

        {/* Run row */}
        <div className="mt-[18px] flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Run
            <span className="inline-block border border-rule px-1 py-px font-mono text-[9px] text-muted">⌘</span>
            <span className="inline-block border border-rule px-1 py-px font-mono text-[9px] text-muted">↵</span>
          </span>
          <div className="flex items-center gap-2.5">
            {voiceEnabled && (
              <VoiceInputButton
                onTranscription={handleVoiceTranscription}
                onError={handleVoiceError}
                disabled={busy}
                className="shrink-0"
              />
            )}
            <button
              type="button"
              onClick={handleRun}
              disabled={query.trim().length === 0 || busy}
              className="inline-flex items-center gap-2 bg-accent px-[22px] py-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-bg transition-opacity hover:opacity-90 disabled:opacity-[0.35] disabled:cursor-not-allowed"
            >
              Run
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>

      {showExamples && (
        <div className="flex flex-col gap-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Or try one of these
          </p>
          {list.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setQuery(ex); taRef.current?.focus(); }}
              disabled={busy}
              className="group flex items-baseline justify-between gap-3 border border-rule bg-bg px-4 py-3.5 text-left transition-all hover:border-accent hover:pl-5"
            >
              <span className="font-serif italic text-[16px] leading-snug text-fg-2 transition-colors group-hover:text-fg">
                {ex}
              </span>
              <span aria-hidden="true" className="font-mono text-[12px] text-muted transition-colors group-hover:text-accent">
                →
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
