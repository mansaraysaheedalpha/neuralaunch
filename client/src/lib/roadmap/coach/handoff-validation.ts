import type { PreparationPackage } from "./schemas";

export function validatePreparationHandoffs(
  preparation: PreparationPackage,
): PreparationPackage {
  for (const item of preparation.postConversationChecklist) {
    const hasTool = item.suggestedTool === "outreach_composer";
    const hasContext = Boolean(item.composerContext);
    if (hasTool !== hasContext) {
      throw new Error(
        "Coach checklist handoff must include both tool and Composer context",
      );
    }
  }
  return preparation;
}
