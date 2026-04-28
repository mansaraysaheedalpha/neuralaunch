import { ChevronsRight } from "lucide-react";
import { MockFrame } from "./mock-frame";

const BRIEF_SECTIONS = [
  { n: 1, label: "What happened", tone: "slate" as const },
  { n: 2, label: "What I got wrong", tone: "gold" as const },
  { n: 3, label: "What the evidence says", tone: "slate" as const },
  { n: 4, label: "Forks", tone: "success" as const, withIcon: true },
  { n: 5, label: "Parking lot", tone: "slate" as const },
];

const BRIEF_TONE: Record<"slate" | "gold" | "success", string> = {
  slate: "border-slate-700 bg-navy-950 text-slate-300",
  gold: "border-gold/30 bg-gold/5 text-gold",
  success: "border-success/30 bg-success/5 text-success",
};

export function ContinuationBriefMock() {
  return (
    <MockFrame className="min-h-[260px]">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        Continuation brief
      </p>
      <ol className="mt-3 space-y-2">
        {BRIEF_SECTIONS.map((s) => (
          <li
            key={s.n}
            className={`flex items-center gap-2.5 rounded-md border px-3 py-1.5 ${BRIEF_TONE[s.tone]}`}
          >
            <span className="text-[10px] font-semibold tabular-nums">
              {String(s.n).padStart(2, "0")}
            </span>
            <span className="flex-1 text-xs">{s.label}</span>
            {s.withIcon && <ChevronsRight className="h-3.5 w-3.5" />}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex justify-end">
        <span
          role="presentation"
          className="rounded-full border border-success/40 bg-success/5 px-3 py-1 text-xs text-success"
        >
          Pick a fork &rarr;
        </span>
      </div>
    </MockFrame>
  );
}
