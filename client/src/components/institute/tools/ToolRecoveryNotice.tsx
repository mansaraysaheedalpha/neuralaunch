import { AlertCircle } from "lucide-react";

export interface ToolRecoveryNoticeProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  workPreserved: string;
  leaveGuidance: string;
  operationStatus: "stopped" | "running_unknown" | "completed_not_loaded";
  usageStatus?: "not_consumed" | "may_be_consumed" | "server_reconciled";
  className?: string;
}

const OPERATION_COPY = {
  stopped: "The failed operation is no longer running.",
  running_unknown:
    "The server may still be working. Retrying now could create a duplicate operation.",
  completed_not_loaded:
    "The server finished, but this page could not load the saved result.",
};
const USAGE_COPY = {
  not_consumed: "No tool usage was consumed.",
  may_be_consumed:
    "The attempt may have consumed usage if model work began; the server reconciles the meter.",
  server_reconciled:
    "Usage is recorded by the server and appears after reconciliation.",
};

export function ToolRecoveryNotice({
  message,
  onRetry,
  retryLabel = "Try again",
  workPreserved,
  leaveGuidance,
  operationStatus,
  usageStatus = "server_reconciled",
  className = "",
}: ToolRecoveryNoticeProps) {
  return (
    <section
      className={`border border-accent bg-accent/[0.04] p-4 ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex gap-3">
        <AlertCircle
          className="mt-0.5 size-4 shrink-0 text-accent"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-fg">
            Something interrupted this step
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-2">
            {message}
          </p>
          <dl className="mt-3 grid gap-2 text-[11px] leading-relaxed text-muted sm:grid-cols-2">
            <div>
              <dt className="font-medium text-fg-2">Your work</dt>
              <dd>{workPreserved}</dd>
            </div>
            <div>
              <dt className="font-medium text-fg-2">Operation</dt>
              <dd>{OPERATION_COPY[operationStatus]}</dd>
            </div>
            <div>
              <dt className="font-medium text-fg-2">Usage</dt>
              <dd>{USAGE_COPY[usageStatus]}</dd>
            </div>
            <div>
              <dt className="font-medium text-fg-2">Leaving this page</dt>
              <dd>{leaveGuidance}</dd>
            </div>
          </dl>
          {onRetry && operationStatus !== "running_unknown" && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 bg-accent px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-bg"
            >
              {retryLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
