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

// Define type for the API response
interface CofounderApiResponse {
  response?: string;
  error?: string;
}

export default function CofounderChat() {
  const [input, setInput] = useState<string>("");
  const {
    messages,
    addMessage,
    isLoading,
    setIsLoading,
    error,
    setError,
    // You might add setMessages later if you implement loading history
  } = useCofounderStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const params = useParams();
  const conversationId = params.conversationId as string;

  // Scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle message submission
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !conversationId) return;

    setError(null);
    setIsLoading(true);

    const userMessage: CofounderMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
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

  return (
    // Root div fills height and uses flex-col
    <div className="flex flex-col h-full">
      {/* Message area scrolls */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="space-y-6 max-w-4xl mx-auto">
          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              } animate-slide-up`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div
                className={`max-w-[85%] rounded-3xl px-7 py-5 shadow-md transition-all duration-300 ${
                  message.role === "user"
                    ? "bg-muted text-foreground"
                    : "bg-card border border-border"
                }`}
              >
                <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start max-w-4xl mx-auto animate-slide-up">
              <div className="max-w-[85%] rounded-3xl px-7 py-5 shadow-lg bg-card border border-border">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce"></div>
                  <div
                    className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                  <div
                    className="w-2.5 h-2.5 bg-primary rounded-full animate-bounce"
                    style={{ animationDelay: "0.4s" }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {/* Error display inline */}
          {error && !isLoading && (
            <div className="flex justify-start max-w-4xl mx-auto animate-slide-up">
              <div className="max-w-[85%] rounded-3xl px-7 py-5 shadow-md bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700">
                <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                  Error: {error}
                </p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area fixed at the bottom */}
      <div className="p-4 sm:p-6 lg:p-6 pb-8 bg-gradient-to-t from-background via-background/95 to-transparent relative z-20 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          <form
            ref={formRef}
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="relative"
          >
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-purple-600 rounded-3xl opacity-0 group-hover:opacity-20 blur-xl transition duration-500"></div>
              <div className="relative flex items-end gap-3 bg-card rounded-3xl shadow-2xl p-2 border-2 border-border transition-all duration-200 focus-within:border-primary focus-within:shadow-[0_0_0_4px_hsla(var(--primary),0.1)]">
                <TextareaAutosize
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask your AI Cofounder..."
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
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="flex-shrink-0 p-3.5 rounded-2xl bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 disabled:scale-100 mr-1"
                  aria-label="Send message to Cofounder"
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
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">
              Press{" "}
              <kbd className="px-2 py-1 bg-muted rounded border border-border font-mono text-xs">
                Enter
              </kbd>{" "}
              to send,{" "}
              <kbd className="px-2 py-1 bg-muted rounded border border-border font-mono text-xs">
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
