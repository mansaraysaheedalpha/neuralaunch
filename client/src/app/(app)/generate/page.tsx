"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useSession } from "next-auth/react";
import TextareaAutosize from "react-textarea-autosize";
import { motion, AnimatePresence } from "framer-motion"; // Import motion
import { useChatStore } from "@/lib/stores/chatStore";
import { useConversationStore } from "@/lib/stores/conversationStore";
import { useSWRConfig } from "swr";
import { trackEvent } from "@/lib/analytics";
import { Lock } from "lucide-react";
import { signIn } from "next-auth/react";

// Define type for API error response
interface ApiErrorResponse {
  detail?: string;
  message?: string;
}

// Simplified ProTip - Less prominent, more focused
const ExamplePrompt = ({
  icon,
  text,
  delay,
}: {
  icon: string;
  text: string;
  delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: delay, duration: 0.5 }}
    className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg border border-border/50"
  >
    <span className="mt-0.5">{icon}</span>
    <span>{text}</span>
  </motion.div>
);

export default function GeneratePage() {
  const [input, setInput] = useState<string>("");
  const router = useRouter();
  const { status } = useSession();
  const { mutate } = useSWRConfig();
  const { addConversation } = useConversationStore();
  const {
    messages,
    setMessages,
    addMessage,
    updateMessage,
    isLoading,
    setIsLoading,
    setError, // Make sure error state is destructured
    error, // Also get the error state itself
  } = useChatStore();

  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset state only on initial mount or when explicitly needed
    setMessages([]);
    setError(null);
  }, [setMessages, setError]); // Keep dependencies minimal

  useEffect(() => {
    // Scroll smoothly when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

    const userMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content: input,
    };

    // Optimistic UI update
    addMessage(userMessage);
    const currentMessages = [...messages, userMessage]; // Use updated messages for API call
    setInput("");

    void (async () => {
      try {
        const requestBody = { messages: currentMessages }; // Send the latest message list
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok || !res.body) {
          const errorData: unknown = res.body ? await res.json() : {};
          const typedError = errorData as ApiErrorResponse;
          throw new Error(
            typedError.detail ||
              typedError.message ||
              `Server error: ${res.status}`
          );
        }

        const newConversationId = res.headers.get("X-Conversation-Id");
        const newConversationTitle = res.headers.get("X-Conversation-Title");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const modelMessageId = `${Date.now()}-streaming`;

        // Add placeholder for streaming AI response
        addMessage({ id: modelMessageId, role: "model", content: "" });

        let accumulatedText = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulatedText += decoder.decode(value, { stream: true });
          updateMessage(modelMessageId, accumulatedText);
        }

        // Navigation logic after stream finishes
        if (
          status === "authenticated" &&
          newConversationId &&
          newConversationTitle
        ) {
          trackEvent("generate_idea", { conversationId: newConversationId });
          addConversation({
            id: newConversationId,
            title: newConversationTitle,
            updatedAt: new Date().toISOString(),
          });
          router.push(`/chat/${newConversationId}`);
        } else if (status === "authenticated" && newConversationId) {
          // Fallback if title header is missing (less likely with correct API)
          await mutate("/api/conversations");
          router.push(`/chat/${newConversationId}`);
        }
        // No else needed here, setIsLoading(false) is handled in finally
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
        // Optionally remove the streaming placeholder on error, or update it
        // removeMessage(modelMessageId); // Example: Define removeMessage in store if needed
      } finally {
        setIsLoading(false); // Ensure loading is always set to false at the end
      }
    })();
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-background via-violet-50/10 to-purple-50/10 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/50">
      {/* Subtle background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-30 blur-[100px]"></div>
        <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-gradient-to-tl from-secondary/5 via-transparent to-transparent opacity-30 blur-[100px]"></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-4 space-y-6 relative z-10">
        <AnimatePresence>
          {messages.length === 0 && !isLoading && (
            <motion.div
              key="hero-content"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-10 px-4"
            >
              <div className="space-y-4 max-w-4xl mx-auto">
                {/* Refined Headline */}
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter text-foreground leading-tight">
                  Go from <span className="text-primary">Skill</span> to{" "}
                  <span className="bg-gradient-to-r from-secondary via-accent to-primary bg-clip-text text-transparent">
                    Validated Startup
                  </span>
                  . Fast.
                </h1>
                {/* Clearer Subheadline */}
                <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  Describe your unique skills, passions, or a problem you see.
                  Our AI architect will generate a high-probability startup
                  blueprint in minutes.
                </p>
              </div>

              {/* Example Prompts - More subtle */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl mx-auto w-full pt-6 text-left">
                <ExamplePrompt
                  icon="🐍"
                  text="Expert in Python & data analysis, passionate about reducing food waste."
                  delay={0.3}
                />
                <ExamplePrompt
                  icon="⚛️"
                  text="React developer frustrated by inefficient project management tools for freelancers."
                  delay={0.4}
                />
                <ExamplePrompt
                  icon="🎨"
                  text="Skilled graphic designer who loves sustainable fashion but finds sourcing hard."
                  delay={0.5}
                />
              </div>
            </motion.div>
          )}

          {messages.length > 0 && (
            <motion.div
              key="chat-messages"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="space-y-6 max-w-4xl mx-auto"
            >
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-3xl px-6 py-4 shadow-md transition-all duration-300 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border"
                    }`}
                  >
                    {message.role === "user" ? (
                      <p className="text-base leading-relaxed">
                        {message.content}
                      </p>
                    ) : (
                      <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {/* Loading Indicator */}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <motion.div
                  key="loading-indicator"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex justify-start"
                >
                  <div className="max-w-[85%] rounded-3xl px-6 py-4 shadow-md bg-card border border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-primary rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-primary rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                  </div>
                </motion.div>
              )}

              {!isLoading &&
                status === "unauthenticated" &&
                messages.length > 0 && (
                  <motion.div
                    key="signin-prompt"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }} // Appear slightly after last message
                    className="mt-8 p-6 bg-primary/10 dark:bg-primary/20 border-2 border-dashed border-primary/30 rounded-2xl text-center max-w-2xl mx-auto"
                  >
                    <Lock className="w-8 h-8 text-primary mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      Save Your Blueprint & Unlock More Features
                    </h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Sign in to save this conversation, access your validation
                      sprint, and use the AI co-pilot.
                    </p>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        void signIn("google"); // Use the exact pattern from LoginButton
                      }}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold shadow-md hover:opacity-90 transition-opacity"
                    >
                      Sign In with Google to Continue
                    </motion.button>
                  </motion.div>
                )}
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />{" "}
        {/* Ensure this is outside conditional rendering */}
      </div>

      {/* Sticky Input Area - Enhanced Styling */}
      <div className="p-4 sm:p-6 bg-gradient-to-t from-background via-background/95 to-transparent sticky bottom-0 z-20">
        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto mb-3 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-xl text-center"
          >
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              ⚠️ {error}
            </p>
          </motion.div>
        )}
        <div className="max-w-4xl mx-auto">
          {/* <p className="text-xs text-center text-amber-600 dark:text-amber-400 mb-3 px-4">
            <span className="font-semibold">Tip:</span> For the best AI
            Cofounder experience later, focus on exploring one startup idea per
            chat session.
          </p> */}
          <form ref={formRef} onSubmit={handleSubmit} className="relative">
            {/* Subtle Glow Effect on Hover/Focus */}
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-secondary rounded-3xl opacity-0 focus-within:opacity-30 group-hover:opacity-10 blur-xl transition duration-500 pointer-events-none"></div>
            <div className="relative flex items-end gap-2 bg-card rounded-3xl shadow-xl p-2 border-2 border-border transition-all duration-300 focus-within:border-primary/80 focus-within:shadow-[0_0_0_4px_hsla(var(--primary),0.15)]">
              <TextareaAutosize
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="I'm a Python developer passionate about..."
                minRows={1}
                maxRows={5}
                className="flex-1 bg-transparent border-0 focus:ring-0 text-base text-foreground placeholder-muted-foreground resize-none outline-none px-4 py-3"
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
                className="flex-shrink-0 p-3.5 rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-primary/40 disabled:scale-100 disabled:shadow-none mr-1"
                aria-label="Generate Startup Blueprint"
              >
                {isLoading ? (
                  <svg
                    className="w-6 h-6 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 2.5a.75.75 0 01.75.75V5a.75.75 0 01-1.5 0V3.25A.75.75 0 0110 2.5zM7.004 5.004a.75.75 0 01.75-.75h1.547a.75.75 0 110 1.5H7.754a.75.75 0 01-.75-.75zM12.996 5.004a.75.75 0 01.75.75v1.547a.75.75 0 11-1.5 0V5.754a.75.75 0 01.75-.75zM15 7.004a.75.75 0 01.75.75v1.547a.75.75 0 11-1.5 0V7.754a.75.75 0 01.75-.75zM5 7.004a.75.75 0 01.75-.75h1.547a.75.75 0 110 1.5H5.754a.75.75 0 01-.75-.75zM10 15a.75.75 0 01.75.75v1.547a.75.75 0 11-1.5 0V15.75a.75.75 0 01.75-.75zM7.004 12.996a.75.75 0 01.75-.75h1.547a.75.75 0 110 1.5H7.754a.75.75 0 01-.75-.75zM12.996 12.996a.75.75 0 01.75.75v1.547a.75.75 0 11-1.5 0V13.75a.75.75 0 01.75-.75zM15 10a.75.75 0 01.75.75v1.547a.75.75 0 11-1.5 0V10.75a.75.75 0 01.75-.75zM5 10a.75.75 0 01.75-.75h1.547a.75.75 0 110 1.5H5.754a.75.75 0 01-.75-.75zM10 6.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </motion.button>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">
              Press{" "}
              <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border font-mono text-xs">
                Enter
              </kbd>{" "}
              to generate,{" "}
              <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border font-mono text-xs">
                Shift + Enter
              </kbd>{" "}
              for new line
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
