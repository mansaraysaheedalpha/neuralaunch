import type { ReactNode } from "react";

export function MobileDisclosure({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between border border-rule-strong px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-fg lg:hidden">
        {title}
        <span aria-hidden="true" className="text-accent group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="hidden group-open:block lg:!block">{children}</div>
    </details>
  );
}
