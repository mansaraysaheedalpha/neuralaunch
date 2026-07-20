"use client";

import type {
  ToolJobProgressEvent,
  ToolJobStage,
} from "@/lib/tool-jobs";

export interface StepTrailProps {
  query: string;
  stage: ToolJobStage;
  events: ToolJobProgressEvent[];
}

const STAGE_COPY: Partial<Record<ToolJobStage, string>> = {
  queued: "Waiting for the research worker",
  context_loaded: "Loading founder and roadmap context",
  researching: "Research engine is working",
  emitting: "Structuring the research report",
  persisting: "Saving verified output",
  complete: "Research completed and persisted",
};

export function StepTrail({ query, stage, events }: StepTrailProps) {
  const complete = stage === "complete";
  const current = STAGE_COPY[stage] ?? "Research is running";

  return (
    <section className="flex flex-col" aria-labelledby="research-activity-title">
      <div className="mb-3 border-l-2 border-accent bg-accent/[0.04] px-3 py-2">
        <p
          id="research-activity-title"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
        >
          Live execution record · server reported
        </p>
        <p className="mt-1 text-xs leading-relaxed text-fg-2">
          Only completed engine phases and actual provider calls appear here.
        </p>
      </div>

      <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-3.5">
        <p className="max-w-[75%] truncate font-serif text-[18px] italic leading-snug text-fg">
          {query}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
          {complete ? `${events.length} events · saved` : current}
        </p>
      </div>

      {events.length === 0 ? (
        <p className="border-b border-rule py-4 text-sm text-muted" role="status">
          {current}. The first event will appear when the server confirms it.
        </p>
      ) : (
        <ol className="flex flex-col" aria-live="polite" aria-relevant="additions">
          {events.map((event) => (
            <li
              key={event.id}
              className="grid grid-cols-[24px_1fr_auto] items-baseline gap-3 border-b border-rule py-3"
            >
              <EventGlyph status={event.status} />
              <span className="text-sm leading-snug text-fg">
                {event.label}
                {event.source && (
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                    · {event.source}
                  </span>
                )}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                {event.status}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function EventGlyph({ status }: { status: ToolJobProgressEvent["status"] }) {
  const glyph = status === "completed" ? "●" : status === "failed" ? "×" : "◐";
  return (
    <span
      aria-hidden="true"
      className={status === "failed" ? "text-danger" : "text-accent"}
    >
      {glyph}
    </span>
  );
}
