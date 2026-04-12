// src/lib/roadmap/coach/index.ts
//
// Public API for the Conversation Coach module.

export {
  COACH_CHANNELS,
  COACH_TOOL_ID,
  ROLEPLAY_HARD_CAP_TURNS,
  ROLEPLAY_WARNING_TURN,
  SETUP_MAX_EXCHANGES,
  type CoachChannel,
} from './constants';

export {
  ConversationSetupSchema,
  PreparationPackageSchema,
  RolePlaySetupSchema,
  RolePlayTurnSchema,
  DebriefSchema,
  CoachSessionSchema,
  ToolSessionsArraySchema,
  safeParseToolSessions,
  type ConversationSetup,
  type PreparationPackage,
  type RolePlaySetup,
  type RolePlayTurn,
  type Debrief,
  type CoachSession,
  type ToolSessions,
} from './schemas';
