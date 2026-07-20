"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ToolRecoveryNotice } from "@/components/institute/tools/ToolRecoveryNotice";
import {
  ValidationEmptyPreview,
  formatRecommendationDate,
} from "./ValidationEmptyPreview";
import type {
  ValidationClientProps as Props,
  ValidationCreateResponse as CreateResponse,
} from "./validation-types";
import { ValidationSuccess } from "./ValidationSuccess";
export type { RecommendationOption } from "./validation-types";

type Phase = "idle" | "generating" | "success" | "error";

export function StandaloneValidationClient({ recommendations }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [recommendationId, setRecommendationId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<CreateResponse | null>(null);
  const [error, setError] = useState("");
  const selected = recommendations.find((item) => item.id === recommendationId);
  const canGenerate =
    phase !== "generating" && Boolean(selected ?? target.trim());

  async function generate() {
    if (!canGenerate) return;
    setPhase("generating");
    setError("");
    try {
      const url = selected
        ? `/api/discovery/recommendations/${selected.id}/validation-page`
        : "/api/tools/validation/generate";
      const body = selected
        ? undefined
        : JSON.stringify({ target: target.trim() });
      const response = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          failure.error ?? "Could not create the validation page.",
        );
      }
      const data = (await response.json()) as CreateResponse;
      setResult(data);
      setPhase("success");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Network error — please try again.",
      );
      setPhase("error");
    }
  }

  if (phase === "success" && result) {
    return <ValidationSuccess result={result} />;
  }

  return (
    <div className="grid min-h-[560px] lg:grid-cols-[1fr_1.35fr]">
      <section className="flex flex-col gap-7 border-r border-rule px-6 py-8 sm:px-10">
        <div className="flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
          <span>01 · Hypothesis</span>
          <span className="text-accent">Draft</span>
        </div>
        {recommendations.length > 0 && (
          <label className="grid gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
            Evidence source
            <select
              id="validation-evidence-source"
              aria-describedby="validation-source-help"
              value={recommendationId}
              onChange={(event) => setRecommendationId(event.target.value)}
              disabled={phase === "generating"}
              className="border border-rule bg-bg-2 px-3 py-3 font-sans text-[12px] normal-case tracking-normal text-fg outline-none focus:border-accent"
            >
              <option value="">Standalone hypothesis</option>
              {recommendations.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatRecommendationDate(item.createdAt)} — {item.label}
                </option>
              ))}
            </select>
            <span
              id="validation-source-help"
              className="normal-case tracking-normal text-[11px]"
            >
              Choose an existing recommendation or write a standalone hypothesis
              below.
            </span>
          </label>
        )}
        {selected ? (
          <div className="border-l-2 border-accent bg-accent/[0.04] px-4 py-4">
            <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-accent">
              Pulled from venture recommendation
            </p>
            <p className="mt-2 font-serif text-[18px] italic leading-relaxed text-fg">
              {selected.label}
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              The existing recommendation supplies the page brief and connects
              resulting signals to the venture lifecycle.
            </p>
          </div>
        ) : (
          <div className="border border-rule bg-bg-2 focus-within:border-accent">
            <label htmlFor="validation-hypothesis" className="sr-only">
              Validation hypothesis
            </label>
            <textarea
              id="validation-hypothesis"
              aria-describedby="validation-hypothesis-help validation-hypothesis-count"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              disabled={phase === "generating"}
              maxLength={2000}
              placeholder="State the offer, audience, price, and the behavior that would count as real interest…"
              className="min-h-[190px] w-full resize-none bg-transparent p-5 font-serif text-[20px] italic leading-relaxed text-fg outline-none placeholder:text-muted-2"
            />
            <p
              id="validation-hypothesis-help"
              className="border-t border-rule px-4 py-2 text-[11px] text-muted"
            >
              Include the offer, audience, price, and behavior that would count
              as interest.
            </p>
            <div
              id="validation-hypothesis-count"
              className="border-t border-rule px-4 py-2 text-right font-mono text-[8px] text-muted"
              aria-live="polite"
            >
              {target.length} / 2000
            </div>
          </div>
        )}
        {error && (
          <ToolRecoveryNotice
            message={error}
            onRetry={() => void generate()}
            workPreserved="Your hypothesis and selected evidence source remain in this form."
            leaveGuidance="The standalone hypothesis is not saved yet. Copy it before leaving this page."
            operationStatus="stopped"
            usageStatus="may_be_consumed"
          />
        )}
        <button
          type="button"
          onClick={() => {
            void generate();
          }}
          disabled={!canGenerate}
          className="sticky bottom-0 z-10 mt-auto bg-accent px-5 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-bg [margin-bottom:env(safe-area-inset-bottom)] disabled:opacity-35 lg:static lg:mb-0"
        >
          {phase === "generating"
            ? "Drafting the page…"
            : "Create validation page →"}
        </button>
      </section>
      <ValidationEmptyPreview active={phase === "generating"} />
    </div>
  );
}
