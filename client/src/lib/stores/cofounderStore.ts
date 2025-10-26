//src/lib/stores/cofounderStore.ts
import { create } from "zustand";

// Message type specifically for the Cofounder chat
export type CofounderMessage = {
  id: string;
  role: "user" | "cofounder"; // Use 'cofounder' role
  content: string;
};

interface CofounderState {
  messages: CofounderMessage[];
  isLoading: boolean; // Is the Cofounder currently generating a response?
  error: string | null;
  currentConversationId: string | null;
  setMessages: (messages: CofounderMessage[]) => void;
  addMessage: (message: CofounderMessage) => void;
  // Function to update the last message content (for streaming, if added later)
  updateLastMessage: (content: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentConversationId: (id: string | null) => void;
  resetStore: () => void;
}

export const useCofounderStore = create<CofounderState>((set) => ({
  messages: [],
  isLoading: false,
  error: null,
  currentConversationId: null,
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateLastMessage: (content) =>
    set((state) => {
      if (state.messages.length === 0) return {};
      const lastMessageIndex = state.messages.length - 1;
      const updatedMessages = [...state.messages];
      updatedMessages[lastMessageIndex] = {
        ...updatedMessages[lastMessageIndex],
        content: content,
      };
      return { messages: updatedMessages };
    }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }), // Set loading false on error
  setCurrentConversationId: (id) => set({ currentConversationId: id }),
  resetStore: () =>
    set({
      messages: [],
      isLoading: false,
      error: null,
      currentConversationId: null,
    }),
}));
