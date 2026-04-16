import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Input — canonical text-input primitive.
 *
 * Matches the Button primitive's design language:
 *   - 3px focus-visible ring (ring-primary/30) with a primary-tinted border
 *   - Consistent px-3 py-2.5 padding at the base size
 *   - rounded-lg corners matching Card and elevated surfaces
 *   - Respects dark-mode via the bg-background / border-border tokens
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
        "flex w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-xs transition-colors",
        "placeholder:text-muted-foreground/70",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "outline-none focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "selection:bg-primary selection:text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
