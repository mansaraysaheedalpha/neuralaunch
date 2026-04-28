import type { ReactNode } from "react";

const FRAME =
  "rounded-xl border border-slate-800 bg-navy-900 p-5 shadow-xl shadow-navy-950/50";

export function MockFrame({
  children,
  className = "",
}: {
  children: ReactNode;
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

export function TimeChip({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-slate-700 bg-navy-800 px-2 py-0.5 text-[10px] text-slate-400">
      {children}
    </span>
  );
}
