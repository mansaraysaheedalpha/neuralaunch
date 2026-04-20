// src/lib/roadmap/validation/constants.ts
//
// Canonical tool identifier for the Validation Tool. Matches the
// pattern set by the four pre-existing roadmap-integrated tools:
//   coach/constants.ts    → 'conversation_coach'
//   composer/constants.ts → 'outreach_composer'
//   research-tool/constants.ts → 'research_tool'
//   service-packager/constants.ts → 'service_packager'
//
// Validation joined the roadmap-integrated roster in the
// feat/validation-tool-integration branch (see
// docs/validation-tool-integration-audit.md).

export const VALIDATION_TOOL_ID = 'validation' as const;
export type ValidationToolId = typeof VALIDATION_TOOL_ID;
