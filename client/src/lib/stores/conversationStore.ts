// src/lib/stores/conversationStore.ts

import { create } from "zustand";

type Conversation = {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
};

interface ConversationState {
  conversations: Conversation[];
  isLoading: boolean; // This is now specific to loading conversations
  error: string | null;
  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  removeConversation: (conversationId: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  isLoading: false,
  error: null,
  setConversations: (conversations) => set({ conversations, isLoading: false }),
  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),
  removeConversation: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== conversationId),
    })),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
}));
