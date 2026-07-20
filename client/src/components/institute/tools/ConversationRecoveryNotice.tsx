import { ToolRecoveryNotice } from "./ToolRecoveryNotice";

const COPY = {
  coach_setup: {
    work: "Your unsent draft and confirmed setup answers remain on this page.",
    leave:
      "Copy the unsent draft before leaving; only server-confirmed answers are guaranteed to persist.",
  },
  coach_rehearsal: {
    work: "The saved rehearsal transcript and your current response remain available.",
    leave:
      "Copy the unsent response before leaving; completed turns remain saved.",
  },
  composer_context: {
    work: "Your outreach brief and confirmed answers remain in the composer.",
    leave:
      "Copy the unsent draft before leaving; the latest server-confirmed answers remain saved.",
  },
};

export function ConversationRecoveryNotice({
  message,
  context,
}: {
  message: string;
  context: keyof typeof COPY;
}) {
  const copy = COPY[context];
  return (
    <ToolRecoveryNotice
      message={message}
      workPreserved={copy.work}
      leaveGuidance={copy.leave}
      operationStatus="running_unknown"
      usageStatus="may_be_consumed"
    />
  );
}
