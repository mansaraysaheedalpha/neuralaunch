// client/src/components/landing-page/CofounderChat.tsx
"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import TextareaAutosize from "react-textarea-autosize";
import {
  useCofounderStore,
  CofounderMessage,
} from "@/lib/stores/cofounderStore";
import { trackEvent } from "@/lib/analytics";
import { Bot, User, CornerDownLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Define type for the API response
interface CofounderApiResponse {
  response?: string;
  error?: string;
}

// --- NEW Loading Indicator Component ---
const ThinkingIndicator = () => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex justify-start mb-4" // Align left like Cofounder messages
  >
    <div className="flex items-center gap-2 p-3 rounded-2xl bg-muted/50 border border-border">
      {/* Simple pulsing dots with primary color */}
      <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
      <div
        className="w-2 h-2 bg-primary rounded-full animate-pulse"
        style={{ animationDelay: "0.1s" }}
      ></div>
      <div
        className="w-2 h-2 bg-primary rounded-full animate-pulse"
        style={{ animationDelay: "0.2s" }}
      ></div>
      <span className="text-sm text-muted-foreground ml-2">
        Cofounder is thinking...
      </span>
    </div>
  </motion.div>
);

const CofounderEmptyState = ({
  onPromptClick,
}: {
  onPromptClick: (prompt: string) => void;
}) => {
  const prompts = [
    "What are the biggest risks in my blueprint?",
    "Suggest 3 specific next steps for validation.",
    "Help me brainstorm customer interview questions.",
    "Whom are my target audience for sharing my landing page based on my blueprint",
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="flex flex-col items-center justify-center h-full text-center px-6"
    >
      <div className="p-4 bg-primary/10 rounded-full mb-4">
        <Bot className="w-10 h-10 text-primary" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        Your AI Cofounder is Ready
      </h2>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm">
        Ask me anything about your startup blueprint, validation sprint, or
        strategy. I use your project&apos;s context to provide tailored advice.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
        {prompts.map((prompt, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.1 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onPromptClick(prompt)}
            className="p-3 bg-card dark:bg-slate-700/50 border border-border rounded-lg text-sm text-foreground hover:bg-muted/80 dark:hover:bg-slate-700 transition-colors text-left"
          >
            {prompt}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
};
// ------------------------------------

export default function CofounderChat() {
  const [input, setInput] = useState<string>("");
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const {
    messages,
    setMessages,
    addMessage,
    isLoading,
    setIsLoading,
    error,
    setError,
    currentConversationId,
    setCurrentConversationId,
    resetStore,
  } = useCofounderStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const params = useParams();
  const conversationId = params.conversationId as string;

  // Load messages from database on mount
  useEffect(() => {
    const loadMessages = async () => {
      if (!conversationId) return;

      // Only reload if we're switching to a different conversation
      if (currentConversationId !== conversationId) {
        resetStore(); // Clear the store before loading new conversation
        setCurrentConversationId(conversationId);
      }

      setIsInitialLoading(true);
      try {
        const res = await fetch(
          `/api/cofounder/messages?conversationId=${conversationId}`
        );

        if (!res.ok) {
          throw new Error("Failed to load cofounder messages");
        }

        const data: unknown = await res.json();
        // Type guard to check if data has the expected structure
        if (
          data &&
          typeof data === "object" &&
          "messages" in data &&
          Array.isArray(data.messages)
        ) {
          // Convert database messages to CofounderMessage format
          const loadedMessages: CofounderMessage[] = data.messages.map(
            (msg: {
              id: string;
              content: string;
              role: string;
              createdAt: string;
            }) => ({
              id: msg.id,
              role: msg.role as "user" | "cofounder",
              content: msg.content,
            })
          );
          setMessages(loadedMessages);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to load messages";
        console.error("Error loading cofounder messages:", message);
        // Don't set error state here to avoid blocking new messages
      } finally {
        setIsInitialLoading(false);
      }
    };

    void loadMessages();
  }, [conversationId, setMessages, currentConversationId, setCurrentConversationId, resetStore]);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle message submission
  const handleSubmit = async (
    e?: FormEvent<HTMLFormElement> | null,
    promptText?: string
  ) => {
    if (e) e.preventDefault();
    const messageContent = (promptText ?? input).trim(); // Use provided promptText if available, otherwise use input state

    if (!messageContent || isLoading || !conversationId) return;

    trackEvent("use_ai_cofounder", {
      conversationId: conversationId,
    });
    setError(null);
    setIsLoading(true);

    const userMessage: CofounderMessage = {
      id: Date.now().toString(),
      role: "user",
      content: messageContent,
    };
    addMessage(userMessage);
    setInput(""); // Clear input immediately

    try {
      const res = await fetch("/api/cofounder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId,
        }),
      });

      const data = (await res.json()) as CofounderApiResponse;

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to get response from Cofounder.");
      }

      if (data.response) {
        const cofounderMessage: CofounderMessage = {
          id: `${Date.now()}-cofounder`,
          role: "cofounder",
          content: data.response,
        };
        addMessage(cofounderMessage);
      } else {
        throw new Error("Cofounder returned an empty response.");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unknown error occurred.";
      setError(message);
      // Optional: Add an error message to the chat
      addMessage({
        id: `${Date.now()}-error`,
        role: "cofounder",
        content: `Sorry, I encountered an error: ${message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function for prompt buttons
  const handlePromptClick = (prompt: string) => {
    void handleSubmit(null, prompt); // Call handleSubmit without event, passing the prompt
  };

  return (
    // Container with distinct background
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 via-gray-100 to-slate-200 dark:from-slate-800 dark:via-slate-800/50 dark:to-gray-900">
      {/* Message area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-4">
        {/* Conditional Rendering: Empty State or Messages */}
        {messages.length === 0 && !isLoading && !isInitialLoading ? (
          <CofounderEmptyState onPromptClick={handlePromptClick} />
        ) : (
          <div className="max-w-4xl mx-auto">
            {" "}
            {/* Width constraint for messages */}
            <AnimatePresence>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex items-start gap-3 mb-4 ${
                    // Added mb-4 for spacing
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "cofounder" && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                      <Bot className="w-5 h-5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-sm ${
                      // Adjusted padding/rounding
                      message.role === "user"
                        ? "bg-primary text-primary-foreground" // User message style
                        : "bg-card border border-border" // Cofounder message style
                    }`}
                  >
                    <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed">
                      {" "}
                      {/* Removed prose-sm */}
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  </div>
                  {message.role === "user" && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center mt-1">
                      <User className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {/* Loading Indicator */}
            {isLoading && <ThinkingIndicator />}
            {/* Error Display */}
            {error && !isLoading && (
              <motion.div /* Add error styles if needed */
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start mb-4" // Align left like Cofounder messages
              >
                <div className="max-w-[85%] rounded-2xl px-5 py-3 shadow-sm bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700">
                  {" "}
                  {/* Mimic bubble style */}
                  <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                    Error: {error}
                  </p>
                </div>
              </motion.div>
            )}
          </div>
        )}
        {/* Scroll Anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 sm:px-6 sm:pb-6 border-t border-border bg-background/80 dark:bg-slate-900/80 backdrop-blur-sm flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          <form
            ref={formRef}
            onSubmit={(e) => {
              // Prevent returning a Promise to the DOM event handler
              void handleSubmit(e);
            }}
            className="relative"
          >
            <div className="relative flex items-center gap-2 border border-input rounded-xl focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 bg-card p-1 pr-2 shadow-sm">
              <TextareaAutosize
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask your AI Cofounder..."
                minRows={1}
                maxRows={4}
                className="flex-1 bg-transparent border-0 focus:ring-0 text-sm text-foreground placeholder-muted-foreground resize-none outline-none px-3 py-2.5"
                required
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
              />
              <motion.button
                type="submit"
                disabled={isLoading || !input.trim()}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex-shrink-0 p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                aria-label="Send message to Cofounder"
              >
                {isLoading ? (
                  <div className="w-5 h-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent"></div> // Simple spinner
                ) : (
                  <CornerDownLeft className="w-5 h-5" /> // Enter key icon
                )}
              </motion.button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Shift+Enter for new line
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
