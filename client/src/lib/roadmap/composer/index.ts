// src/lib/roadmap/composer/index.ts
//
// Public API for the Outreach Composer module.

export {
  COMPOSER_CHANNELS,
  COMPOSER_MODES,
  COMPOSER_TOOL_ID,
  MAX_REGENERATIONS_PER_MESSAGE,
  CONTEXT_MAX_EXCHANGES,
  type ComposerChannel,
  type ComposerMode,
} from './constants';

export {
  OutreachContextSchema,
  ComposerMessageSchema,
  ComposerOutputSchema,
  ComposerSessionSchema,
  safeParseComposerSession,
  type OutreachContext,
  type ComposerMessage,
  type ComposerOutput,
  type ComposerSession,
} from './schemas';
