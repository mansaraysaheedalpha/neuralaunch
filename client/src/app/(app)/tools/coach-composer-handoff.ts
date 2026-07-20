import type { CoachSession } from "@/lib/roadmap/coach";

interface CoachHandoffParams {
  roadmapId: string;
  sessionId: string;
  checklistIndex: number;
}

export function readCoachHandoffParams(): CoachHandoffParams | null {
  const params = new URL(window.location.href).searchParams;
  const roadmapId = params.get("roadmapId");
  const sessionId = params.get("fromCoach");
  const checklistIndex = Number(params.get("checklist"));
  if (
    !roadmapId ||
    !sessionId ||
    !Number.isInteger(checklistIndex) ||
    checklistIndex < 0
  )
    return null;
  return { roadmapId, sessionId, checklistIndex };
}

export async function fetchCoachChecklistHandoff(
  params: CoachHandoffParams,
): Promise<string | null> {
  const response = await fetch(
    `/api/discovery/roadmaps/${encodeURIComponent(params.roadmapId)}/coach/sessions/${encodeURIComponent(params.sessionId)}`,
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { session?: CoachSession };
  const item =
    data.session?.preparation?.postConversationChecklist[params.checklistIndex];
  if (item?.suggestedTool !== "outreach_composer" || !item.composerContext)
    return null;
  const context = item.composerContext;
  return [
    `Draft the post-conversation follow-up for ${context.recipient}.`,
    `Outcome: ${context.conversationOutcome}`,
    context.agreedTerms ? `Agreed terms: ${context.agreedTerms}` : null,
    `Goal: ${context.messageGoal}`,
    `Channel: ${context.channel}`,
    `Coach session: ${params.sessionId}`,
  ]
    .filter(Boolean)
    .join("\n");
}
