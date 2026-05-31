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
        "flex min-h-[80px] w-full resize-y rounded-lg border border-rule bg-bg px-3 py-2.5 text-sm text-fg shadow-xs transition-colors",
        "placeholder:text-muted/70",
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

export { Textarea };
