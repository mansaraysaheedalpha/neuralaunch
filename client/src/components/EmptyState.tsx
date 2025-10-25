// src/components/EmptyState.tsx
/**
 * Empty State Component
 * 
 * Provides consistent empty states throughout the application
 */

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /**
   * Icon to display
   */
  icon?: LucideIcon;
  
  /**
   * Title of the empty state
   */
  title: string;
  
  /**
   * Description text
   */
  description?: string;
  
  /**
   * Call-to-action button or custom action element
   */
  action?: ReactNode;
  
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * Empty State Component
 * 
 * Use this to show when there's no data to display
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-8 md:p-12",
        className
      )}
    >
      {Icon && (
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
          <Icon className="w-8 h-8 text-muted-foreground" />
        </div>
      )}
      
      <h3 className="text-xl md:text-2xl font-semibold text-foreground mb-2">
        {title}
      </h3>
      
      {description && (
        <p className="text-muted-foreground max-w-md mb-6">
          {description}
        </p>
      )}
      
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * Empty State Card Variant
 * Wrapped in a card for better visual hierarchy
 */
export function EmptyStateCard(props: EmptyStateProps) {
  return (
    <div className="bg-card border border-border rounded-xl">
      <EmptyState {...props} />
    </div>
  );
}
