import { ServicePackageSchema } from "./schemas";
import { PackageDecisionSchema } from "./package-decision-schema";

/** Required provider-output shape; persisted legacy packages may omit decision. */
export const GeneratedServicePackageSchema = ServicePackageSchema.extend({
  decision: PackageDecisionSchema,
});
