import { DecisionFooter } from "@/components/institute/tools/DecisionFooter";
import type { DispatchPlan } from "@/lib/roadmap/composer";

export function ComposerDecisionFooter({ plan }: { plan: DispatchPlan }) {
  const recipients = [...plan.firstRecipients].sort(
    (a, b) => a.priority - b.priority,
  );
  return (
    <DecisionFooter
      data={{
        label: "Dispatch decision",
        decision: plan.recommendationReason,
        learned: recipients.map(
          (recipient) => `${recipient.description}: ${recipient.reason}`,
        ),
        next: {
          action: `Send the recommended message first to ${recipients.map((item) => item.description).join(", ")}.`,
          successSignal: plan.responseSignals.strongInterest.join("; "),
          timing: `${plan.timing.sendBy}; follow up ${plan.timing.followUpAfter}.`,
        },
        saved:
          "Message drafts, recipient order, timing, response signals, and stop rules are saved to this Composer session.",
        reconsiderWhen: [
          ...plan.changeMessageWhen.map(
            (item) => `Change the message: ${item}`,
          ),
          ...plan.changeAudienceWhen.map(
            (item) => `Change the audience: ${item}`,
          ),
          `Stop: ${plan.stopRule}`,
        ],
      }}
    />
  );
}
