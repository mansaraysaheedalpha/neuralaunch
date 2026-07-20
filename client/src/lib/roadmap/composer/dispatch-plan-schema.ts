import { z } from "zod";

const DispatchRecipientSchema = z.object({
  description: z
    .string()
    .describe("The specific person or audience segment to contact."),
  priority: z
    .number()
    .describe("Whole-number send priority, where 1 is first.")
    .transform((value) => Math.max(1, Math.floor(value))),
  reason: z
    .string()
    .describe(
      "Why this recipient is strategically useful for the outreach goal.",
    ),
});

export const DispatchPlanSchema = z.object({
  recommendedMessageId: z
    .string()
    .describe("ID of the message the founder should send first."),
  recommendationReason: z
    .string()
    .describe("Why this message and approach should be used first."),
  firstRecipients: z
    .array(DispatchRecipientSchema)
    .describe("Ordered initial recipients or recipient segments."),
  timing: z.object({
    sendBy: z
      .string()
      .describe("Practical timing guidance for the first send."),
    followUpAfter: z
      .string()
      .describe("When to follow up if there is no response."),
  }),
  responseSignals: z.object({
    strongInterest: z
      .array(z.string())
      .describe("Observable replies or actions that indicate strong interest."),
    weakInterest: z
      .array(z.string())
      .describe("Replies that show curiosity but not commitment."),
    rejection: z
      .array(z.string())
      .describe("Replies or behavior that indicate rejection."),
  }),
  stopRule: z
    .string()
    .describe(
      "The condition under which the founder should stop following up.",
    ),
  changeMessageWhen: z
    .array(z.string())
    .describe("Evidence that should trigger a change to the message."),
  changeAudienceWhen: z
    .array(z.string())
    .describe("Evidence that should trigger a change to the target audience."),
});

export type DispatchPlan = z.infer<typeof DispatchPlanSchema>;

/** Fail closed when the model recommends a message it did not emit. */
export function validateDispatchPlanForMessages(
  plan: DispatchPlan,
  messageIds: string[],
): DispatchPlan {
  if (!messageIds.includes(plan.recommendedMessageId)) {
    throw new Error("Composer dispatch plan references an unknown message id");
  }
  if (plan.firstRecipients.length === 0) {
    throw new Error(
      "Composer dispatch plan must include at least one initial recipient",
    );
  }
  if (
    plan.responseSignals.strongInterest.length === 0 ||
    plan.changeMessageWhen.length === 0 ||
    plan.changeAudienceWhen.length === 0
  ) {
    throw new Error(
      "Composer dispatch plan must include observable decision evidence",
    );
  }
  return plan;
}
