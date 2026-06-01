'use client';
// src/components/discovery/standard/TranscriptModal.tsx
//
// Full-page transcript overlay for the standard discovery interview.
// A reference, not a chat UI: agent turns set in body text on a --bg-2
// card, user turns set with an --accent left border. Turns come from
// the conversation history already in state.

import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ChatMessage } from '@/components/discovery/message-types';

export interface TranscriptModalProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
}

export function TranscriptModal({ open, onClose, messages }: TranscriptModalProps) {
  // Esc closes; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg/95 backdrop-blur-md">
      <header className="flex items-center justify-between border-b border-rule px-9 py-5">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          Transcript · <span className="text-fg">{messages.length} turns</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close transcript"
          className="inline-flex items-center gap-2 border border-rule-strong px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-fg transition-colors hover:border-accent hover:text-accent"
        >
          <X aria-hidden="true" className="size-3.5" />
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-10 sm:px-10">
        <div className="mx-auto grid max-w-[760px] gap-5">
          {messages.length === 0 ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              No turns yet.
            </p>
          ) : (
            messages.map((m, i) => (
              <div key={m.id ?? i}>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  {m.role === 'assistant' ? 'NeuraLaunch' : 'You'}
                  {m.inputMethod === 'voice' && (
                    <span className="ml-2 text-accent">· voice</span>
                  )}
                </div>
                {m.role === 'assistant' ? (
                  <div className="border border-rule bg-bg-2 px-5 py-4 text-[15px] leading-[1.6] text-fg-2">
                    {m.content || <span className="text-muted">—</span>}
                  </div>
                ) : (
                  <div className="border-l-2 border-accent pl-5 text-[15px] leading-[1.6] text-fg">
                    {m.content}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
