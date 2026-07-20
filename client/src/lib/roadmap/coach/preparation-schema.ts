import { z } from "zod";

export const RolePlaySetupSchema = z.object({
  personality: z.string(),
  motivations: z.string(),
  probableConcerns: z.array(z.string()),
  powerDynamic: z.string(),
  communicationStyle: z.string(),
});
export type RolePlaySetup = z.infer<typeof RolePlaySetupSchema>;

export const PreparationPackageSchema = z.object({
  openingScript: z
    .string()
    .describe("Exact channel-native words used to start the conversation."),
  keyAsks: z
    .array(
      z.object({
        ask: z.string().describe("A concrete conversation outcome."),
        whyItMatters: z
          .string()
          .describe("Why the outcome supports the founder's goal."),
      }),
    )
    .describe("Two or three specific outcomes."),
  objections: z
    .array(
      z.object({
        objection: z.string().describe("Likely pushback from the other party."),
        response: z
          .string()
          .describe("Prepared response grounded in founder context."),
        groundedIn: z
          .string()
          .describe("Belief or context supporting the response."),
      }),
    )
    .describe("Likely pushbacks with prepared responses."),
  fallbackPositions: z.array(
    z.object({
      trigger: z.string().describe("Condition that activates this fallback."),
      fallback: z
        .string()
        .describe("Minimum acceptable outcome or alternative."),
    }),
  ),
  postConversationChecklist: z
    .array(
      z.object({
        condition: z.string().describe("Outcome that triggers this action."),
        action: z.string().describe("Specific immediate follow-up action."),
        suggestedTool: z
          .enum(["outreach_composer"])
          .optional()
          .describe(
            "Set when the action needs a written follow-up drafted in Composer.",
          ),
        composerContext: z
          .object({
            recipient: z.string(),
            conversationOutcome: z.string(),
            agreedTerms: z.string().optional(),
            channel: z.enum(["whatsapp", "email", "linkedin"]),
            messageGoal: z.string(),
          })
          .optional()
          .describe(
            "Typed Composer handoff context; required with suggestedTool.",
          ),
      }),
    )
    .describe(
      "Outcome-based actions, including typed Composer handoffs when useful.",
    ),
  rolePlaySetup: RolePlaySetupSchema,
});
export type PreparationPackage = z.infer<typeof PreparationPackageSchema>;
