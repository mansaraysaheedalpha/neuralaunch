import { z } from "zod";

export const ReadinessVerdictSchema = z.object({
  status: z.enum(["ready", "rehearse_once_more", "revise_plan"]),
  summary: z
    .string()
    .describe("Direct readiness decision grounded in the rehearsal."),
  evidence: z
    .array(z.string())
    .describe("Specific rehearsal evidence supporting the verdict."),
  primaryRisk: z
    .string()
    .describe("The most important remaining execution risk."),
  nextAction: z
    .string()
    .describe("The single next action the founder should take."),
  nextActionTiming: z
    .string()
    .describe("Practical timing for completing the next action."),
  readyWhen: z
    .array(z.string())
    .describe("Observable conditions that indicate readiness."),
  reconsiderWhen: z
    .array(z.string())
    .describe("Evidence that should trigger more rehearsal or a revised plan."),
});

export type ReadinessVerdict = z.infer<typeof ReadinessVerdictSchema>;

export function validateReadinessVerdict(
  verdict: ReadinessVerdict,
): ReadinessVerdict {
  if (verdict.evidence.length === 0 || verdict.readyWhen.length === 0) {
    throw new Error("Coach readiness verdict must include observable evidence");
  }
  if (verdict.reconsiderWhen.length === 0) {
    throw new Error("Coach readiness verdict must define when to reconsider");
  }
  return verdict;
}
