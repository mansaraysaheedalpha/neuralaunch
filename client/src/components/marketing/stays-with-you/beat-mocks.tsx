import type { ReactNode } from "react";

const FRAME =
  "min-h-[140px] rounded-lg border border-slate-800 bg-navy-950 p-3.5";

function Mock({ children }: { children: ReactNode }) {
  return (
    <div role="presentation" aria-hidden="true" className={FRAME}>
      {children}
    </div>
  );
}

export function CheckInBeatMock() {
  return (
    <Mock>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        Nudge
      </p>
      <p className="mt-2 text-xs leading-snug text-slate-200">
        &lsquo;Draft tier sheet&rsquo; is 2 days past estimate. Share what
        came up?
      </p>
      <p className="mt-2 text-[10px] font-medium text-primary">
        Open task &rarr;
      </p>
    </Mock>
  );
}

const MEMORY_ROWS = [
  { week: "W1", body: "‘Suppliers slow to respond’" },
  { week: "W3", body: "‘Mariama confirmed pricing’" },
  { week: "W4", body: "Idea: WhatsApp catalogue" },
];

export function MemoryBeatMock() {
  return (
    <Mock>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        Held in context
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {MEMORY_ROWS.map((row) => (
          <li
            key={row.week}
            className="flex items-center gap-2 rounded-md border border-slate-800 bg-navy-900 px-2 py-1"
          >
            <span className="shrink-0 text-[10px] font-semibold tabular-nums text-success">
              {row.week}
            </span>
            <span className="truncate text-[10px] text-slate-300">
              {row.body}
            </span>
          </li>
        ))}
      </ul>
    </Mock>
  );
}

export function RecalibrationBeatMock() {
  return (
    <Mock>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gold">
        Recalibration available
      </p>
      <p className="mt-2 text-xs leading-snug text-slate-200">
        Three check-ins suggest the tier mix isn&rsquo;t working. Revisit?
      </p>
      <div className="mt-2 flex gap-1.5">
        <span
          role="presentation"
          className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-medium text-gold"
        >
          Revisit
        </span>
        <span
          role="presentation"
          className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400"
        >
          Not yet
        </span>
      </div>
    </Mock>
  );
}

const BRIEF_ROWS = [
  { label: "What happened", filled: false },
  { label: "What I got wrong", filled: false },
  { label: "Evidence says", filled: false },
  { label: "Forks", filled: true },
  { label: "Parking lot", filled: false },
];

export function ContinuationBeatMock() {
  return (
    <Mock>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        Cycle brief
      </p>
      <ol className="mt-2 flex flex-col gap-1.5">
        {BRIEF_ROWS.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span
              className={`h-1.5 w-12 shrink-0 rounded-full ${
                row.filled ? "bg-success/60" : "bg-slate-700"
              }`}
            />
            <span
              className={`text-[10px] ${
                row.filled
                  ? "font-medium text-success"
                  : "text-slate-400"
              }`}
            >
              {row.label}
            </span>
          </li>
        ))}
      </ol>
    </Mock>
  );
}
