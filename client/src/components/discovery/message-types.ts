// src/components/discovery/message-types.ts
//
// The ChatMessage wire type used by the discovery hook + the Institute
// shells (StandardChat, TranscriptModal, SessionResumption). Extracted
// from the deleted MessageList.tsx so the type survives the legacy
// chat-bubble component's removal in PR 16.

export interface ChatMessage {
  id:      string;
  role:    'user' | 'assistant';
  content: string;
  /** 'voice' when this user bubble originated from a microphone transcription. */
  inputMethod?: 'voice' | null;
}
