import { Check } from "lucide-react";
import { MockFrame, TimeChip } from "./mock-frame";

const PHASES = [
  { name: "Phase 1", duration: "2 weeks", current: true },
  { name: "Phase 2", duration: "3 weeks", current: false },
  { name: "Phase 3", duration: "4 weeks", current: false },
];

export function RoadmapMock() {
  return (
    <MockFrame className="min-h-[260px]">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        Roadmap &middot; Phase 1 of 3
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {PHASES.map((phase) => (
          <div
            key={phase.name}
            className={`rounded-md border px-2 py-1.5 text-center ${
              phase.current
                ? "border-gold/40 bg-gold/5"
                : "border-slate-700 bg-navy-950"
            }`}
          >
            <p
              className={`text-[10px] font-medium ${
                phase.current ? "text-gold" : "text-slate-300"
              }`}
            >
              {phase.name}
            </p>
            <p className="text-[10px] text-slate-400">{phase.duration}</p>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        <li className="flex items-center gap-3">
          <span className="h-4 w-4 shrink-0 rounded-full border border-slate-700" />
          <span className="flex-1 text-xs text-slate-200">
            Map five suppliers in your market
          </span>
          <TimeChip>2h</TimeChip>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary">
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
          </span>
          <span className="flex-1 text-xs text-slate-200">
            Draft service tier sheet
          </span>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <TimeChip>4h</TimeChip>
        </li>
        <li className="flex items-center gap-3">
          <span className="h-4 w-4 shrink-0 rounded-full border border-slate-700" />
          <span className="flex-1 text-xs text-slate-200">
            Send first 5 outreach messages
          </span>
          <TimeChip>1 evening</TimeChip>
        </li>
      </ul>
    </MockFrame>
  );
}
