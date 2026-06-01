// src/components/discovery/index.ts
//
// Public re-exports for the discovery UI module. The legacy
// chat-bubble surface (DiscoveryChat + its WelcomeLayer /
// InterviewGuide / QuestionStepper / ThinkingPanel / MessageList
// dependencies) was deleted in PR 16; the Institute shell in
// `./standard/` is the only render surface.

export type { ChatMessage } from './message-types';
