import type { ReactNode } from "react";

const FRAME =
  "h-[100px] rounded-lg border border-slate-800 bg-navy-950 p-3";

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
      <p className="mt-1.5 text-xs leading-snug text-slate-200">
        Task &lsquo;Draft tier sheet&rsquo; is 2 days past estimate. Want to
        share what came up?
      </p>
      <p className="mt-1.5 text-[10px] text-primary">Open task &rarr;</p>
    </Mock>
  );
}

export function MemoryBeatMock() {
  return (
    <Mock>
      <div className="flex flex-col">
        <div className="rounded-md border border-slate-800 bg-navy-900 px-2 py-1">
          <p className="text-[10px] text-slate-300">
            W1 &middot; &lsquo;Suppliers slow to respond&rsquo;
          </p>
        </div>
        <div className="-mt-1 rounded-md border border-slate-800 bg-navy-900 px-2 py-1">
          <p className="text-[10px] text-slate-300">
            W3 &middot; &lsquo;Mariama confirmed pricing&rsquo;
          </p>
        </div>
        <div className="-mt-1 rounded-md border border-slate-800 bg-navy-900 px-2 py-1">
          <p className="text-[10px] text-slate-300">
            W4 &middot; Idea: WhatsApp catalogue
          </p>
        </div>
      </div>
    </Mock>
  );
}

export function RecalibrationBeatMock() {
  return (
    <Mock>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gold">
        Recalibration available
      </p>
      <p className="mt-1.5 text-xs leading-snug text-slate-200">
        Three check-ins suggest the service-tier mix isn&rsquo;t working.
        Revisit?
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <span
          role="presentation"
          className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] text-gold"
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
      <ol className="flex flex-col gap-1.5">
        {BRIEF_ROWS.map((row) => (
          <li key={row.label} className="flex items-center gap-2">
            <span
              className={`h-2 flex-1 rounded-full ${
                row.filled ? "bg-success/40" : "bg-slate-800"
              }`}
            />
            <span
              className={`shrink-0 text-[10px] ${
                row.filled ? "text-success" : "text-slate-400"
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
