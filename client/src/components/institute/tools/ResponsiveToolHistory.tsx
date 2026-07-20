import type { ReactNode } from "react";

export function ResponsiveToolHistory({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="group border border-rule-strong lg:border-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg lg:hidden">
        {label}
        <span aria-hidden="true" className="text-accent group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="border-t border-rule lg:!block lg:border-t-0">
        {children}
      </div>
    </details>
  );
}
