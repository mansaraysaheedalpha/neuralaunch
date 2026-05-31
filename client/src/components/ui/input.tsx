import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Input — canonical text-input primitive.
 *
 * Matches the Button primitive's design language:
 *   - 3px focus-visible ring (ring-accent/30) with a primary-tinted border
 *   - Consistent px-3 py-2.5 padding at the base size
 *   - rounded-lg corners matching Card and elevated surfaces
 *   - Respects dark-mode via the bg-bg / border-rule tokens
 *   - Placeholder at 70% muted-foreground for subtle-but-legible contrast
 *   - Disabled state: reduced opacity + not-allowed cursor
 *
 * Supports every React.ComponentProps<"input"> prop (including ref).
 */
function Input({
  className,
  type = "text",
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex w-full rounded-lg border border-rule bg-bg px-3 py-2.5 text-sm text-fg shadow-xs transition-colors",
        "placeholder:text-muted/70",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
        "outline-none focus-visible:border-accent focus-visible:ring-accent/30 focus-visible:ring-[3px]",
        "aria-invalid:border-accent aria-invalid:ring-accent/20 dark:aria-invalid:ring-accent/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "selection:bg-accent selection:text-bg",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
