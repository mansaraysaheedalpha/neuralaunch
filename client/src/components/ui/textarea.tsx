import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Textarea — canonical multi-line text-input primitive.
 *
 * Shares the Input primitive's design language:
 *   - 3px focus-visible ring with a primary-tinted border
 *   - px-3 py-2.5 padding, rounded-lg corners
 *   - min-h-[80px] with vertical resize allowed
 *   - Placeholder at 70% muted-foreground
 *
 * Supports every React.ComponentProps<"textarea"> prop (including ref).
 */
function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[80px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-xs transition-colors",
        "placeholder:text-muted-foreground/70",
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

export { Textarea };
