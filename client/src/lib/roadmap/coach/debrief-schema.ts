import { z } from "zod";
import { ReadinessVerdictSchema } from "./readiness-verdict-schema";

export const DebriefSchema = z.object({
  whatWentWell: z
    .array(z.string())
    .describe("Effective moments from the rehearsal."),
  whatToWatchFor: z
    .array(z.string())
    .describe("Execution risks observed in rehearsal."),
  revisedSections: z
    .object({
      openingScript: z.string().optional(),
      additionalObjection: z
        .object({
          objection: z.string(),
          response: z.string(),
        })
        .optional(),
    })
    .optional(),
  /** Optional only so historical debriefs remain readable. */
  readinessVerdict: ReadinessVerdictSchema.optional(),
});
export type Debrief = z.infer<typeof DebriefSchema>;
