import { DebriefSchema } from "./schemas";
import { ReadinessVerdictSchema } from "./readiness-verdict-schema";

/** Required model-output shape; historical debriefs may omit the verdict. */
export const GeneratedDebriefSchema = DebriefSchema.extend({
  readinessVerdict: ReadinessVerdictSchema,
});
