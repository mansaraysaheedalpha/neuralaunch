import type { ComposerChannel, ComposerMode } from "@/lib/roadmap/composer";
import { ToolRecoveryNotice } from "@/components/institute/tools/ToolRecoveryNotice";

export function ComposerOutputHeader({
  mode,
  channel,
  messageCount,
  error,
  onCopyAll,
}: {
  mode: ComposerMode;
  channel: ComposerChannel;
  messageCount: number;
  error: string | null;
  onCopyAll: () => void;
}) {
  const label =
    mode === "sequence"
      ? "Follow-up sequence"
      : mode === "batch"
        ? `Batch (${messageCount} messages)`
        : "Message";
  return (
    <>
      <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-muted">
        <p>02 · Dispatches</p>
        <p className="text-accent">
          {label} · {channel}
        </p>
        {mode === "batch" && messageCount > 1 && (
          <button
            type="button"
            onClick={onCopyAll}
            className="border border-rule px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-fg hover:border-accent hover:text-accent"
          >
            Copy all
          </button>
        )}
      </div>
      {error && (
        <ToolRecoveryNotice
          message={error}
          workPreserved="All generated messages remain visible. Sent status changes are shown only after server confirmation."
          leaveGuidance="Generated messages are saved. Retry the failed action from this session after reopening it."
          operationStatus="stopped"
          usageStatus="may_be_consumed"
        />
      )}
    </>
  );
}
