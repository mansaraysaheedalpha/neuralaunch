// src/lib/stores/chatStore.ts

import { create } from "zustand";

type Message = {
  id: string;
  role: "user" | "model";
  content: string;
};

interface ChatState {
  messages: Message[];
  isLoading: boolean; // This is specific to the chat (e.g., AI is streaming)
  error: string | null;
  setMessages: (
    messages: Message[] | ((prevState: Message[]) => Message[])
  ) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  error: null,
  setMessages: (messages) =>
    set((state) => ({
      messages:
        typeof messages === "function" ? messages(state.messages) : messages,
      // Optional: Reset loading state when messages are set directly
      // isLoading: typeof messages !== 'function' ? false : state.isLoading
    })),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, content } : msg
      ),
    })),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  
}));
