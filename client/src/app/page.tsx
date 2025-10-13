// client/src/app/page.tsx
"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

type Message = {
  id: string;
  role: "user" | "model";
  content: string;
};

export default function HomePage() {
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setError("");
    setIsLoading(true);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          conversationId: null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(
          errorData.detail || "Failed to get response from server."
        );
      }

      const newConversationId = res.headers.get("X-Conversation-Id");

      if (newConversationId) {
        router.push(`/chat/${newConversationId}`);
      } else {
        throw new Error("Failed to create a new conversation.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
    }
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

            {/* Feature Pills - Enhanced Padding */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
              <div className="flex items-center gap-2.5 px-5 py-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-full border border-gray-200 dark:border-gray-700 shadow-sm">
                <svg
                  className="w-5 h-5 text-violet-600 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                </svg>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  AI-Powered
                </span>
              </div>
              <div className="flex items-center gap-2.5 px-5 py-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-full border border-gray-200 dark:border-gray-700 shadow-sm">
                <svg
                  className="w-5 h-5 text-violet-600 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  Instant Ideas
                </span>
              </div>
              <div className="flex items-center gap-2.5 px-5 py-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-full border border-gray-200 dark:border-gray-700 shadow-sm">
                <svg
                  className="w-5 h-5 text-violet-600 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path
                    fillRule="evenodd"
                    d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  Personalized
                </span>
              </div>
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
                    <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-bold prose-p:leading-relaxed prose-pre:bg-gray-900 prose-pre:text-gray-100">
                      {message.content}
                    </ReactMarkdown>
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
                      handleSubmit(e as any);
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
