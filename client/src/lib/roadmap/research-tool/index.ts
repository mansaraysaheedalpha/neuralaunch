// src/lib/roadmap/research-tool/index.ts
//
// Public API for the Founder Research Tool module.

export {
  RESEARCH_TOOL_ID,
  FINDING_TYPES,
  CONFIDENCE_LEVELS,
  RESEARCH_EXECUTION_STEPS,
  RESEARCH_FOLLOWUP_STEPS,
  FOLLOWUP_MAX_ROUNDS,
  type FindingType,
  type ConfidenceLevel,
} from './constants';

export {
  SocialMediaProfileSchema,
  ContactInfoSchema,
  ResearchFindingSchema,
  ResearchSourceSchema,
  SuggestedNextStepSchema,
  ResearchReportSchema,
  FollowUpRoundSchema,
  ResearchSessionSchema,
  safeParseResearchSession,
  type SocialMediaProfile,
  type ContactInfo,
  type ResearchFinding,
  type ResearchSource,
  type SuggestedNextStep,
  type ResearchReport,
  type FollowUpRound,
  type ResearchSession,
} from './schemas';
