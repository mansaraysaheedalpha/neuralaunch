import { DecisionFooter } from "@/components/institute/tools/DecisionFooter";
import type { PackageDecision } from "@/lib/roadmap/service-packager";

export function PackageDecisionPanel({
  decision,
}: {
  decision: PackageDecision;
}) {
  const test = decision.nextTest;
  return (
    <DecisionFooter
      data={{
        label: "Recommended first offer",
        decision: decision.recommendation,
        confidence: decision.confidence,
        learned: decision.learned,
        next: {
          action: `${test.action} Audience: ${test.audience} (${test.sampleSize} qualified prospects).`,
          successSignal: test.successSignal,
          timing: test.deadlineGuidance,
        },
        saved:
          "The complete offer, tier rationale, revenue scenarios, prospect brief, and test decision are saved to this package session.",
        reconsiderWhen: decision.reconsiderWhen,
      }}
    />
  );
}
