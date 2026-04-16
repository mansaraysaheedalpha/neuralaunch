'use client';
// src/app/(app)/discovery/roadmap/[id]/coach/PreparationView.tsx
//
// Renders the five-section PreparationPackage produced by the Coach's
// Opus call. Each section is a collapsible card. The opening script
// has a copy-to-clipboard button. At the bottom a "Start rehearsal →"
// button advances the founder to the role-play stage.

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Copy, Check, PlayCircle } from 'lucide-react';
import type { PreparationPackage, CoachChannel } from '@/lib/roadmap/coach';

export interface PreparationViewProps {
  preparation:   PreparationPackage;
  channel:       CoachChannel;
  onStartReplay: () => void;
}

const CHANNEL_LABELS: Record<CoachChannel, string> = {
  whatsapp:  'WhatsApp',
  in_person: 'In-person',
  email:     'Email',
  linkedin:  'LinkedIn',
};

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title:        string;
  children:     React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={() => { void handleCopy(); }}
      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied
        ? <><Check className="size-3 text-success" /><span className="text-success">Copied</span></>
        : <><Copy className="size-3" /><span>Copy</span></>
      }
    </button>
  );
}

/** Renders the five-section PreparationPackage in collapsible cards. */
export function PreparationView({
  preparation,
  channel,
  onStartReplay,
}: PreparationViewProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Opening script */}
      <CollapsibleSection
        title={`Opening script — ${CHANNEL_LABELS[channel]}`}
        defaultOpen
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-[11px] text-muted-foreground">
            Your exact opening — copy and use it as-is.
          </p>
          <CopyButton text={preparation.openingScript} />
        </div>
        <p className="text-xs text-foreground whitespace-pre-wrap rounded-md bg-muted/40 border border-border px-2.5 py-2 leading-relaxed">
          {preparation.openingScript}
        </p>
      </CollapsibleSection>

      {/* Key asks */}
      <CollapsibleSection title="Key asks" defaultOpen>
        <ol className="flex flex-col gap-2 list-none">
          {preparation.keyAsks.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 size-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">
                {i + 1}
              </span>
              <div>
                <p className="text-[11px] font-medium text-foreground">{item.ask}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.whyItMatters}</p>
              </div>
            </li>
          ))}
        </ol>
      </CollapsibleSection>

      {/* Objection handling */}
      <CollapsibleSection title="Objection handling">
        <div className="flex flex-col gap-3">
          {preparation.objections.map((item, i) => (
            <div key={i} className="rounded-md border border-border overflow-hidden">
              <div className="px-2.5 py-2 bg-red-500/5 border-b border-border">
                <p className="text-[11px] font-medium text-foreground/80 italic">&ldquo;{item.objection}&rdquo;</p>
              </div>
              <div className="px-2.5 py-2 bg-background">
                <p className="text-[11px] text-foreground leading-relaxed">{item.response}</p>
                <p className="text-[10px] text-muted-foreground mt-1.5 pt-1.5 border-t border-border/60">
                  Grounded in: {item.groundedIn}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Fallback positions */}
      <CollapsibleSection title="Fallback positions">
        <div className="flex flex-col gap-2">
          {preparation.fallbackPositions.map((item, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                  {item.trigger}
                </p>
                <p className="text-[11px] text-foreground leading-relaxed">{item.fallback}</p>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Post-conversation checklist */}
      <CollapsibleSection title="After the conversation">
        <div className="flex flex-col gap-2">
          {preparation.postConversationChecklist.map((item, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="size-4 rounded-sm border border-border shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-primary/80 font-medium">{item.condition}</p>
                <p className="text-[11px] text-foreground">{item.action}</p>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <button
        type="button"
        onClick={onStartReplay}
        className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity mt-1"
      >
        <PlayCircle className="size-4" />
        Start rehearsal →
      </button>
    </div>
  );
}
