import {
  AlertTriangle,
  Check,
  ChevronsRight,
  Globe,
  Mic,
  Package,
  Search,
  Send,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

const FRAME =
  "rounded-xl border border-slate-800 bg-navy-900 p-5 shadow-xl shadow-navy-950/50";

function Mock({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={`${FRAME} ${className}`}
    >
      {children}
    </div>
  );
}

export function InterviewMock() {
  return (
    <Mock className="min-h-[260px]">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        Discovery &middot; Question 7 of 11
      </p>
      <div className="mt-3 space-y-2">
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">
          <p className="text-xs leading-snug text-slate-200">
            When you say &ldquo;stuck&rdquo;, is it the next step that&rsquo;s
            unclear &mdash; or do you not trust the direction itself?
          </p>
        </div>
        <div className="ml-6 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2">
          <p className="text-xs leading-snug text-slate-200">
            Mostly the next step &mdash; but sometimes I wonder if I should pivot.
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2">
          <p className="text-xs leading-snug text-slate-200">
            What would &ldquo;right next step&rdquo; need to feel like for you to
            trust it?
          </p>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
          <span>Question 7 of 11</span>
          <span>64%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full w-[64%] rounded-full bg-primary" />
        </div>
      </div>
    </Mock>
  );
}

export function RecommendationPreviewMock() {
  return (
    <Mock className="min-h-[260px] border-l-[3px] border-l-gold">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
        Recommendation
      </p>
      <h4 className="mt-2 text-base font-semibold text-white">
        Pivot to validated services before code.
      </h4>
      <div className="mt-4 space-y-2">
        <div className="flex items-start gap-2.5 rounded-md border border-success/20 bg-success/10 px-3 py-2">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          <p className="text-xs leading-snug text-slate-200">
            <span className="font-medium text-white">Reasoning:</span> Faster
            cash, lower risk than a 6-month build.
          </p>
        </div>
        <div className="flex items-start gap-2.5 rounded-md border border-gold/20 bg-gold/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
          <p className="text-xs leading-snug text-slate-200">
            <span className="font-medium text-white">
              What would make this wrong:
            </span>{" "}
            Service margin under 40%.
          </p>
        </div>
      </div>
    </Mock>
  );
}

const PHASES = [
  { name: "Phase 1", duration: "2 weeks", current: true },
  { name: "Phase 2", duration: "3 weeks", current: false },
  { name: "Phase 3", duration: "4 weeks", current: false },
];

export function RoadmapMock() {
  return (
    <Mock className="min-h-[260px]">
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
    </Mock>
  );
}

function TimeChip({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-slate-700 bg-navy-800 px-2 py-0.5 text-[10px] text-slate-400">
      {children}
    </span>
  );
}

type ToolCell = {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  tone: "primary" | "gold";
};

const TOOL_CELLS: ToolCell[] = [
  { Icon: Mic, label: "Coach", tone: "primary" },
  { Icon: Send, label: "Composer", tone: "primary" },
  { Icon: Search, label: "Research", tone: "primary" },
  { Icon: Package, label: "Packager", tone: "gold" },
  { Icon: Globe, label: "Validation", tone: "gold" },
];

const TOOL_RING: Record<"primary" | "gold", string> = {
  primary: "bg-primary/10 ring-primary/30 text-primary",
  gold: "bg-gold/10 ring-gold/30 text-gold",
};

export function ToolsRowMock() {
  return (
    <Mock className="min-h-[260px]">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        Toolkit
      </p>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {TOOL_CELLS.map(({ Icon, label, tone }) => (
          <div key={label} className="flex flex-col items-center gap-1.5">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-inset ${TOOL_RING[tone]}`}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="text-[10px] text-slate-500">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-md border border-slate-800 bg-navy-950 p-3">
        <p className="text-sm text-slate-200">
          Task: Send first 5 outreach messages
        </p>
        <p className="mt-1 text-xs text-primary">&rarr; Open Outreach Composer</p>
      </div>
    </Mock>
  );
}

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
    <Mock className="min-h-[260px]">
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
    </Mock>
  );
}
