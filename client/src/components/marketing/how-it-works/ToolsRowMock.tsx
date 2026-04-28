import { Globe, Mic, Package, Search, Send } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { MockFrame } from "./mock-frame";

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
    <MockFrame className="min-h-[260px]">
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
        <p className="mt-1 text-xs text-primary">
          &rarr; Open Outreach Composer
        </p>
      </div>
    </MockFrame>
  );
}
