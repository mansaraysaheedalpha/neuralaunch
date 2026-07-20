"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { VoiceInputButton } from "@/components/ui/VoiceInputButton";
import { canUseVoiceMode, useVoiceTier } from "@/lib/voice/client-tier";
import { trackVoiceEvent } from "@/lib/voice/analytics";
import type { ServiceContext } from "@/lib/roadmap/service-packager/schemas";

export interface PackagerContextViewProps {
  context: ServiceContext;
  pending: boolean;
  agentNote?: string | null;
  onConfirm: () => void;
  onAdjust: (message: string) => void;
}

const CONTEXT_FIELDS: Array<{ key: keyof ServiceContext; label: string }> = [
  { key: "serviceSummary", label: "Service summary" },
  { key: "targetMarket", label: "Target market" },
  { key: "competitorPricing", label: "Competitor pricing" },
  { key: "founderCosts", label: "Cost context" },
  { key: "availableHoursPerWeek", label: "Weekly capacity" },
  { key: "researchFindings", label: "Research evidence" },
];

export function PackagerContextView({
  context,
  pending,
  agentNote,
  onConfirm,
  onAdjust,
}: PackagerContextViewProps) {
  const [draft, setDraft] = useState("");
  const voiceEnabled = canUseVoiceMode(useVoiceTier());
  const visibleFields = CONTEXT_FIELDS.flatMap(({ key, label }) => {
    const value = context[key];
    return typeof value === "string" && value.trim()
      ? [{ key, label, value }]
      : [];
  });

  function sendAdjustment() {
    const message = draft.trim();
    if (!message || pending) return;
    onAdjust(message);
    setDraft("");
  }

  return (
    <section className="flex min-h-full flex-col gap-7 px-6 py-8 sm:px-10">
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        <span>01 · Evidence review</span>
        <span className="text-accent">Confirm</span>
      </div>
      <div>
        <p className="font-serif text-[24px] italic leading-snug text-fg">
          The Packager found the shape of the offer.
        </p>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-fg-2">
          Check the evidence before it becomes scope and price. Correcting one
          fact here is more valuable than refining three tiers later.
        </p>
      </div>
      {context.researchFindings && (
        <div className="border-l-2 border-accent bg-accent/[0.04] px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
            Informed by research
          </p>
          {context.researchQuery && (
            <p className="mt-1 text-[12px] text-fg-2">
              {context.researchQuery}
            </p>
          )}
        </div>
      )}
      <dl className="border border-rule-strong">
        {visibleFields.map(({ key, label, value }, index) => (
          <div
            key={key}
            className={`grid gap-2 px-5 py-4 sm:grid-cols-[140px_1fr] ${index > 0 ? "border-t border-rule" : ""}`}
          >
            <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
              {label}
            </dt>
            <dd className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {agentNote && (
        <p className="border-l border-rule pl-4 font-serif text-[15px] italic leading-relaxed text-muted">
          {agentNote}
        </p>
      )}
      <div className="border border-rule bg-bg-2 focus-within:border-accent">
        <label
          htmlFor="packager-context-correction"
          className="block border-b border-rule px-4 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted"
        >
          Correct or add context
        </label>
        <textarea
          id="packager-context-correction"
          aria-describedby="packager-context-help"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="What did the Packager misunderstand or miss?"
          disabled={pending}
          className="min-h-[86px] w-full resize-none bg-transparent px-4 py-3 font-serif text-[17px] italic text-fg outline-none placeholder:text-muted-2 disabled:opacity-50"
        />
        <p
          id="packager-context-help"
          className="border-t border-rule px-4 py-2 text-[11px] leading-relaxed text-muted"
        >
          Corrections are reviewed before the package is generated.
        </p>
        <div className="flex items-center justify-between border-t border-rule px-3 py-2">
          {voiceEnabled ? (
            <VoiceInputButton
              onTranscription={(text) => {
                setDraft((current) => (current ? `${current} ${text}` : text));
                trackVoiceEvent("voice_transcribed", { surface: "packager" });
              }}
              onError={(message) => {
                trackVoiceEvent("voice_error", {
                  surface: "packager",
                  errorMessage: message,
                });
                toast.error(message);
              }}
              disabled={pending}
            />
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={sendAdjustment}
            disabled={pending || !draft.trim()}
            className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg hover:text-accent disabled:opacity-35"
          >
            Send correction →
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onConfirm}
        disabled={pending}
        className="sticky bottom-0 z-10 mt-auto bg-accent px-5 py-4 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-bg [margin-bottom:env(safe-area-inset-bottom)] disabled:opacity-35 lg:static lg:mb-0"
      >
        Evidence is right · build the tiers →
      </button>
    </section>
  );
}
