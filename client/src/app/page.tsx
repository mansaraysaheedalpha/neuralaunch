// client/src/app/page.tsx
"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useStore } from "@/lib/store";
import { useSession } from "next-auth/react";

export default function HomePage() {
  const [input, setInput] = useState<string>("");
  const {
    messages,
    setMessages,
    updateMessage,
    addMessage,
    isLoading,
    setIsLoading,
    error,
    setError,
  } = useStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    // Clear messages and error when the component mounts for a fresh start
    setMessages([]);
    setError(null);
  }, [setMessages, setError]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

    const userMessage = {
      id: Date.now().toString(),
      role: "user" as const,
      content: input,
    };
    addMessage(userMessage);
    const currentMessages = [...messages, userMessage];
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMessages,
          conversationId: null, // Always null for the first message
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          errorData.detail || "Failed to get response from server."
        );
      }

      // --- LOGIC FOR AUTHENTICATED VS. UNAUTHENTICATED ---
      if (status === "authenticated") {
        const newConversationId = res.headers.get("X-Conversation-Id");
        if (newConversationId) {
          router.push(`/chat/${newConversationId}`);
        } else {
          throw new Error("Failed to create a new conversation.");
        }
      } else {
        // Handle streaming for non-authenticated user
        const reader = res.body?.getReader();
        if (!reader) throw new Error("ReadableStream not supported.");

        const decoder = new TextDecoder();
        const modelMessageId = `${Date.now()}-streaming`;
        addMessage({ id: modelMessageId, role: "model", content: "" });

        let accumulatedText = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulatedText += decoder.decode(value, { stream: true });
          updateMessage(modelMessageId, accumulatedText);
        }
        setIsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false); // Make sure loading is turned off on error
    }
    // For authenticated users, finally block is not needed as page will redirect
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-4 space-y-6 relative z-10">
        {messages.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-fade-in px-4">
            {/* Premium Badge */}
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-violet-600/10 to-purple-600/10 border border-violet-200/50 dark:border-violet-500/30 backdrop-blur-sm">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500"></span>
              </div>
              <span className="text-sm font-semibold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
                Powered by Google Gemini AI
              </span>
            </div>

            {/* Hero Content */}
            <div className="space-y-6 max-w-4xl mx-auto">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight">
                <span className="block text-gray-900 dark:text-white leading-tight">
                  Transform Your Skills
                </span>
                <span className="block mt-2 bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 bg-clip-text text-transparent animate-gradient-x">
                  Into Startup Gold
                </span>
              </h1>

              <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto leading-relaxed">
                Unlock your entrepreneurial potential. Enter your skills,
                expertise, or interests to discover innovative startup ideas
                tailored just for you.
              </p>
            </div>

            {/* Suggested Prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto w-full pt-8">
              <SuggestedPrompt
                title="Develop a SaaS"
                description="for social media scheduling"
                onClick={() =>
                  setInput(
                    "I'm a software developer skilled in React and Node.js. I want to build a SaaS for social media scheduling."
                  )
                }
              />
              <SuggestedPrompt
                title="Create a Mobile App"
                description="for local event discovery"
                onClick={() =>
                  setInput(
                    "I'm a UX designer passionate about community building. I want to create a mobile app for finding local events."
                  )
                }
              />
              <SuggestedPrompt
                title="Launch an E-commerce Brand"
                description="for sustainable products"
                onClick={() =>
                  setInput(
                    "I have experience in marketing and logistics. I want to launch an e-commerce brand for sustainable home goods."
                  )
                }
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto">
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                } animate-slide-up`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div
                  className={`max-w-[85%] rounded-3xl px-7 py-5 shadow-lg transition-all duration-300 hover:shadow-xl ${
                    message.role === "user"
                      ? "bg-gradient-to-br from-violet-600 to-purple-600 text-white"
                      : "bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-gray-200 dark:border-gray-700"
                  }`}
                >
                  {message.role === "user" ? (
                    <p className="text-base leading-relaxed">
                      {message.content}
                    </p>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-p:leading-relaxed prose-pre:bg-gray-900 prose-pre:text-gray-100">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isLoading && messages.length > 0 && (
          <div className="flex justify-start max-w-4xl mx-auto animate-slide-up">
            <div className="max-w-[85%] rounded-3xl px-7 py-5 shadow-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-gradient-to-r from-violet-600 to-purple-600 rounded-full animate-bounce"></div>
                <div
                  className="w-2.5 h-2.5 bg-gradient-to-r from-violet-600 to-purple-600 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className="w-2.5 h-2.5 bg-gradient-to-r from-violet-600 to-purple-600 rounded-full animate-bounce"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Enhanced Input Section - Fixed border and placeholder positioning */}
      <div className="p-4 sm:p-6 lg:p-6 pb-8 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-slate-900 dark:via-slate-900/95 backdrop-blur-xl relative z-20">
        {error && (
          <div className="max-w-4xl mx-auto mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl animate-shake">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {error}
              </p>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative group">
              {/* Hover glow effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-purple-600 rounded-3xl opacity-0 group-hover:opacity-20 blur-xl transition duration-500"></div>

              {/* Main input container with improved border on focus */}
              <div className="relative flex items-center gap-3 bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-2 border-2 border-gray-200 dark:border-gray-700 transition-all duration-200 focus-within:border-violet-500 dark:focus-within:border-violet-500 focus-within:shadow-[0_0_0_4px_rgba(124,58,237,0.1)]">
                <textarea
                  id="skillsInput"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Describe your skills, passions, or expertise..."
                  rows={1}
                  className="flex-1 bg-transparent border-0 focus:ring-0 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none outline-none px-4 py-3 min-h-[48px]"
                  required
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e as unknown as FormEvent<HTMLFormElement>);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="flex-shrink-0 p-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 disabled:scale-100 mr-1"
                  aria-label="Send message"
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
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-3">
              Press{" "}
              <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-mono text-xs">
                Enter
              </kbd>{" "}
              to send,{" "}
              <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-mono text-xs">
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

// SuggestedPrompt Component
const SuggestedPrompt = ({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="bg-white/50 dark:bg-slate-800/50 p-6 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 text-left transition-all duration-200 hover:bg-white/80 dark:hover:bg-slate-800/80 hover:shadow-xl hover:scale-[1.02] group"
  >
    <h3 className="font-bold text-gray-900 dark:text-white text-lg">{title}</h3>
    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
      {description}
    </p>
  </button>
);
