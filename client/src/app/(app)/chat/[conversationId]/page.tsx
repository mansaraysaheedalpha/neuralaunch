//client/src/app/(app)/chat/[conversationId]/page.tsx
"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useParams, useRouter } from "next/navigation";
import TextareaAutosize from "react-textarea-autosize";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useChatStore } from "@/lib/stores/chatStore";
import ValidationDashboard from "@/components/ValidationDashboard";
import CofounderChat from "@/components/CofounderChat";
import { trackEvent } from "@/lib/analytics";

// --- Define types for API responses ---
interface Message {
  id: string;
  role: "user" | "model";
  content: string;
}

interface ConversationApiResponse {
  messages: Message[];
  landingPage?: { id: string } | null;
}

interface GenerateApiResponse {
  success: boolean;
  landingPage?: { id: string };
  message?: string;
}

interface ErrorApiResponse {
  message?: string;
  detail?: string;
  error?: string;
}
// ------------------------------------

const ValidationHubButton = ({
  conversationId,
  landingPageId,
}: {
  conversationId: string;
  landingPageId: string | null;
}) => {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleClick = async () => {
    if (landingPageId) {
      router.push(`/build/${landingPageId}`);
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/landing-page/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });

      if (!res.ok) {
        const errorData = (await res.json()) as ErrorApiResponse;
        throw new Error(errorData.message || "Generation failed");
      }
      const data = (await res.json()) as GenerateApiResponse;
      if (data.success && data.landingPage?.id) {
        trackEvent("create_landing_page", {
          conversationId: conversationId,
          landingPageId: data.landingPage.id,
        });
        router.push(`/build/${data.landingPage.id}`);
      } else {
        throw new Error(
          data.message || "Generation failed or missing landing page ID"
        );
      }
    } catch (error: unknown) {
      toast.error(
        `Failed to build page: ${
          error instanceof Error ? error.message : "Please try again."
        }`
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.button
      onClick={() => {
        void handleClick();
      }}
      disabled={isGenerating}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold transition-opacity shadow-lg hover:opacity-90 disabled:opacity-50"
    >
      {isGenerating
        ? "Building Your Hub..."
        : landingPageId
          ? "🚀 View & Edit Landing Page"
          : "🚀 Build Validation Page"}
    </motion.button>
  );
};

// --- Helper component for Tabs ---
const TabButton = ({
  title,
  isActive,
  onClick,
}: {
  title: string;
  isActive: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`px-4 py-3 text-sm font-semibold transition-colors ${
      isActive
        ? "border-b-2 border-primary text-primary"
        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
    }`}
  >
    {title}
  </button>
);

export default function ChatPage() {
  const [activeTab, setActiveTab] = useState<
    "chat" | "validation" | "cofounder"
  >("chat");

  const [input, setInput] = useState<string>("");
  const [landingPageId, setLandingPageId] = useState<string | null>(null);
  const {
    messages,
    setMessages,
    addMessage,
    updateMessage,
    isLoading,
    setIsLoading,
    error,
    setError,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const params = useParams();
  const conversationId = Array.isArray(params.conversationId)
    ? params.conversationId[0]
    : params.conversationId || "";

  useEffect(() => {
    const loadChatHistory = async () => {
      if (conversationId && typeof conversationId === "string") {
        setIsLoading(true);
        setError(null);
        try {
          const res = await fetch(`/api/conversations/${conversationId}`);
          if (res.ok) {
            const responseJson = (await res.json()) as {
              success: boolean;
              data: ConversationApiResponse;
            };

            // 2. Get the actual data from the 'data' property
            const data = responseJson.data;

            setMessages(Array.isArray(data.messages) ? data.messages : []);
            setLandingPageId(data.landingPage?.id ?? null);
          } else {
            const errorData = (await res.json()) as ErrorApiResponse;
            setError(
              `Failed to load conversation: ${
                errorData.message || res.statusText
              }`
            );
          }
        } catch {
          setError("An error occurred while loading the chat.");
        } finally {
          setIsLoading(false);
        }
      } else {
        setError("Invalid conversation ID.");
        setMessages([]);
        setIsLoading(false);
      }
    };
    void loadChatHistory();
  }, [conversationId, setMessages, setIsLoading, setError]);

  useEffect(() => {
    // Only scroll chat messages if the chat tab is active
    if (activeTab === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab]); // Add activeTab dependency

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user" as const,
      content: input,
    };
    addMessage(userMessage);
    setInput("");

    try {
      const requestBody = {
        messages: [...messages, userMessage],
        conversationId,
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorData = (await res.json()) as ErrorApiResponse;
        throw new Error(
          errorData.message ||
            errorData.detail ||
            errorData.error ||
            `Server error: ${res.status}`
        );
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No readable stream available");

      const decoder = new TextDecoder("utf-8");
      const aiMessageId = `${Date.now()}-streaming`;
      let accumulatedContent = "";

      addMessage({
        id: aiMessageId,
        role: "model",
        content: "",
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedContent += chunk;
        updateMessage(aiMessageId, accumulatedContent);
      }
    } catch (streamError: unknown) {
      const errorMessage =
        streamError instanceof Error
          ? streamError.message
          : "An error occurred while sending your message";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-white via-violet-50/20 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 overflow-hidden">
      {/* 1. Blurry Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-violet-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute top-40 right-10 w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>
      {/* --- 2. HEADER AREA (Tabs - Fixed at Top) --- */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-20 flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
          <div className="flex">
            <TabButton
              title="Chat"
              isActive={activeTab === "chat"}
              onClick={() => setActiveTab("chat")}
            />
            <TabButton
              title="Validation Hub"
              isActive={activeTab === "validation"}
              onClick={() => setActiveTab("validation")}
            />
            <TabButton
              title="AI Cofounder ✨"
              isActive={activeTab === "cofounder"}
              onClick={() => setActiveTab("cofounder")}
            />
          </div>
        </div>
      </div>
      {/* --- 3. SCROLLING CONTENT AREA --- */}
      <div className="flex-1 overflow-y-auto relative z-10">
        {/* Conditional Content */}
        {activeTab === "chat" && (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6">
            <div className="space-y-6">
              {/* Chat messages UI */}
              {messages.length === 0 && isLoading ? (
                <div className="flex items-center justify-center min-h-[50vh]">
                  <div className="text-center space-y-4">
                    {/* Loading icon */}
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-600 to-purple-600 rounded-2xl shadow-lg animate-pulse">
                      <svg
                        className="w-8 h-8 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                        />
                      </svg>
                    </div>
                    <p className="text-lg font-medium text-gray-600 dark:text-gray-300">
                      Loading conversation...
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 max-w-4xl mx-auto">
                  {messages.map((message, index) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start"
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
                        {message.role === "user" ? (
                          <p className="text-base leading-relaxed">
                            {message.content}
                          </p>
                        ) : (
                          <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-table:border-collapse prose-th:border prose-th:border-gray-300 dark:prose-th:border-gray-700 prose-th:px-4 prose-th:py-2 prose-th:bg-gray-100 dark:prose-th:bg-gray-800 prose-td:border prose-td:border-gray-300 dark:prose-td:border-gray-700 prose-td:px-4 prose-td:py-2">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {messages.length > 0 && !isLoading && (
                    <div className="max-w-4xl mx-auto my-8 text-center">
                      <ValidationHubButton
                        conversationId={conversationId}
                        landingPageId={landingPageId}
                      />
                    </div>
                  )}
                </div>
              )}
              {/* Loading indicator for model response */}
              {isLoading &&
                messages.length > 0 &&
                !messages.some((m) => m.id.endsWith("-streaming")) && (
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
          </div>
        )}

        {activeTab === "validation" && (
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto w-full">
              <ValidationDashboard />
            </div>
          </div>
        )}

        {/* Cofounder Chat */}
        {activeTab === "cofounder" && (
          <div className="h-full">
            {" "}
            {/* Ensure it can take full height */}
            <CofounderChat />
          </div>
        )}
      </div>{" "}
      {/* End Scrolling Content Area */}
      {/* --- 4. CHAT INPUT AREA (Only for 'chat' tab) --- */}
      {activeTab === "chat" && (
        <div className="p-4 sm:p-6 lg:p-6 pb-8 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-slate-900 dark:via-slate-900/95 backdrop-blur-xl relative z-20 flex-shrink-0">
          {error && (
            <div className="max-w-4xl mx-auto mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-2xl animate-shake">
              <div className="flex items-center gap-3">
                <svg
                  className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                  {error}
                </p>
              </div>
            </div>
          )}
          <div className="max-w-7xl mx-auto">
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
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask a follow-up question..."
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
                    aria-label="Send message"
                  >
                    {isLoading &&
                    !messages.some((m) => m.id.endsWith("-streaming")) ? (
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
      )}
    </div>
  );
}
