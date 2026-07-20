"use client";

import { useState } from "react";
import Link from "next/link";
import { MobileDisclosure } from "@/components/institute/tools/MobileDisclosure";
import type { CoachChannel, PreparationPackage } from "@/lib/roadmap/coach";

export interface PreparationViewProps {
  preparation: PreparationPackage;
  channel: CoachChannel;
  onStartReplay: () => void;
  roadmapId?: string;
  sessionId?: string;
}
const CHANNEL_LABELS: Record<CoachChannel, string> = {
  whatsapp: "WhatsApp",
  in_person: "In person",
  email: "Email",
  linkedin: "LinkedIn",
};

export function PreparationView({
  preparation,
  channel,
  onStartReplay,
  roadmapId,
  sessionId,
}: PreparationViewProps) {
  const [copied, setCopied] = useState(false);
  const copyOpening = async () => {
    try {
      await navigator.clipboard.writeText(preparation.openingScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard is optional. */
    }
  };
  return (
    <section className="flex flex-col gap-8 px-6 py-8 sm:px-10">
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        <span>02 · Preparation dossier</span>
        <span className="text-accent">{CHANNEL_LABELS[channel]}</span>
      </div>
      <section className="border border-rule-strong">
        <header className="flex justify-between border-b border-rule px-5 py-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
          <span>Opening · exact language</span>
          <button
            type="button"
            onClick={() => {
              void copyOpening();
            }}
            className="text-accent"
          >
            {copied ? "Copied ✓" : "Copy opening"}
          </button>
        </header>
        <p className="whitespace-pre-wrap px-5 py-6 font-serif text-[20px] italic leading-[1.6] text-fg">
          {preparation.openingScript}
        </p>
      </section>
      <section>
        <h3 className="mb-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
          The asks
        </h3>
        <ol className="border border-rule-strong">
          {preparation.keyAsks.map((item, index) => (
            <li
              key={`${item.ask}-${index}`}
              className="grid gap-3 border-b border-rule px-5 py-4 last:border-b-0 sm:grid-cols-[30px_1fr]"
            >
              <span className="font-serif text-xl italic text-accent">
                {index + 1}
              </span>
              <div>
                <p className="text-[14px] font-semibold text-fg">{item.ask}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-fg-2">
                  {item.whyItMatters}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <MobileDisclosure
        title={`Objection ledger · ${preparation.objections.length}`}
      >
        <h3 className="mb-3 hidden font-mono text-[9px] uppercase tracking-[0.16em] text-muted lg:block">
          Objection ledger
        </h3>
        <div className="border border-rule-strong">
          {preparation.objections.map((item, index) => (
            <article
              key={`${item.objection}-${index}`}
              className="grid border-b border-rule last:border-b-0 md:grid-cols-[0.8fr_1.2fr]"
            >
              <blockquote className="border-b border-rule bg-accent/[0.04] px-5 py-4 font-serif text-[16px] italic text-fg md:border-b-0 md:border-r">
                “{item.objection}”
              </blockquote>
              <div className="px-5 py-4">
                <p className="text-[13px] leading-relaxed text-fg">
                  {item.response}
                </p>
                <p className="mt-3 border-t border-rule pt-2 font-mono text-[8px] uppercase tracking-[0.12em] text-muted">
                  Grounded in · {item.groundedIn}
                </p>
              </div>
            </article>
          ))}
        </div>
      </MobileDisclosure>
      <div className="grid gap-6 md:grid-cols-2">
        <MobileDisclosure
          title={`Fallback positions · ${preparation.fallbackPositions.length}`}
        >
          <h3 className="mb-3 hidden font-mono text-[9px] uppercase tracking-[0.16em] text-muted lg:block">
            Fallback positions
          </h3>
          <div className="border border-rule-strong">
            {preparation.fallbackPositions.map((item, index) => (
              <div
                key={`${item.trigger}-${index}`}
                className="border-b border-rule px-4 py-3 last:border-b-0"
              >
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-accent">
                  If · {item.trigger}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-fg-2">
                  {item.fallback}
                </p>
              </div>
            ))}
          </div>
        </MobileDisclosure>
        <MobileDisclosure
          title={`After the conversation · ${preparation.postConversationChecklist.length}`}
        >
          <h3 className="mb-3 hidden font-mono text-[9px] uppercase tracking-[0.16em] text-muted lg:block">
            After the conversation
          </h3>
          <div className="border border-rule-strong">
            {preparation.postConversationChecklist.map((item, index) => (
              <div
                key={`${item.condition}-${index}`}
                className="border-b border-rule px-4 py-3 last:border-b-0"
              >
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-accent">
                  When · {item.condition}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-fg-2">
                  {item.action}
                </p>
                {item.suggestedTool === "outreach_composer" &&
                  item.composerContext &&
                  roadmapId &&
                  sessionId && (
                    <Link
                      href={`/tools/outreach-composer?roadmapId=${encodeURIComponent(roadmapId)}&fromCoach=${encodeURIComponent(sessionId)}&checklist=${index}`}
                      className="mt-3 inline-block border border-rule px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-accent hover:border-accent"
                    >
                      Draft this follow-up →
                    </Link>
                  )}
              </div>
            ))}
          </div>
        </MobileDisclosure>
      </div>
      <button
        type="button"
        onClick={onStartReplay}
        className="sticky bottom-0 z-10 bg-accent px-5 py-4 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-bg [margin-bottom:env(safe-area-inset-bottom)] lg:static lg:mb-0"
      >
        Enter rehearsal →
      </button>
    </section>
  );
}
