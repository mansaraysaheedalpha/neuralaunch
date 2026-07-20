import { z } from "zod";

export const PackageDecisionSchema = z.object({
  recommendedTierName: z
    .string()
    .describe(
      "Exact machine-friendly name of the tier the founder should sell first.",
    ),
  recommendation: z
    .string()
    .describe("Concise decision explaining which offer to lead with and why."),
  confidence: z.enum(["low", "medium", "high"]),
  learned: z
    .array(z.string())
    .describe(
      "Most important evidence-grounded conclusions about the offer and pricing.",
    ),
  nextTest: z.object({
    audience: z
      .string()
      .describe(
        "Specific qualified audience for the first real-world offer test.",
      ),
    sampleSize: z
      .number()
      .describe("Positive whole-number target for qualified prospects.")
      .transform((value) => Math.max(1, Math.floor(value))),
    action: z
      .string()
      .describe("Concrete action the founder should take with the package."),
    successSignal: z
      .string()
      .describe("Observable behavior that is sufficient evidence to continue."),
    deadlineGuidance: z
      .string()
      .describe(
        "Practical completion timing without inventing an unknown calendar date.",
      ),
  }),
  reconsiderWhen: z
    .array(z.string())
    .describe(
      "Observable evidence that should trigger a pricing, scope, or audience change.",
    ),
});

export type PackageDecision = z.infer<typeof PackageDecisionSchema>;

export function validatePackageDecision(
  decision: PackageDecision,
  tierNames: string[],
): PackageDecision {
  if (!tierNames.includes(decision.recommendedTierName)) {
    throw new Error("Packager decision references an unknown tier name");
  }
  if (decision.learned.length === 0) {
    throw new Error("Packager decision must include at least one learning");
  }
  if (decision.reconsiderWhen.length === 0) {
    throw new Error("Packager decision must include reconsideration evidence");
  }
  return decision;
}
