//src/app/page.tsx
"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useSession } from "next-auth/react";
import TextareaAutosize from "react-textarea-autosize";
import { useChatStore } from "@/lib/stores/chatStore";
import { useConversationStore } from "@/lib/stores/conversationStore";
import { useSWRConfig } from "swr";
import { trackEvent } from "@/lib/analytics";

// Define type for API error response
interface ApiErrorResponse {
  detail?: string;
  message?: string;
}

const ProTip = ({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) => (
  <div className="bg-card/50 p-4 rounded-lg border border-border">
    <div className="flex items-center gap-3">
      <span className="text-lg">{icon}</span>
      <h4 className="font-semibold text-foreground">{title}</h4>
    </div>
    <p className="text-sm text-muted-foreground mt-1 pl-7">{description}</p>
  </div>
);

export default function HomePage() {
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
    setError,
  } = useChatStore();

  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setError(null);
  }, [setMessages, setError]);

  useEffect(() => {
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
    const currentMessages = [...messages, userMessage];
    addMessage(userMessage);
    setInput("");

    void (async () => {
      try {
        const requestBody = { messages: currentMessages };
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          const errorData: unknown = await res.json();
          const typedError = errorData as ApiErrorResponse;
          throw new Error(
            typedError.detail ||
              typedError.message ||
              "Failed to get response from server."
          );
        }

        const newConversationId = res.headers.get("X-Conversation-Id");
        const newConversationTitle = res.headers.get("X-Conversation-Title");
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

        // ================= THIS IS THE FIX =================
        // We now wait for the entire stream to finish.
        // ONLY THEN do we navigate if the user is authenticated.
        if (
          status === "authenticated" &&
          newConversationId &&
          newConversationTitle
        ) {
          trackEvent("generate_idea", {
            conversationId: newConversationId,
          });
          addConversation({
            id: newConversationId,
            title: newConversationTitle,
            updatedAt: new Date().toISOString(),
          });
          router.push(`/chat/${newConversationId}`);
        } else if (status === "authenticated" && newConversationId) {
            // Fallback just in case (e.g., header missing)
            // This will still have the title lag, but navigation will work
            await mutate("/api/conversations"); // You can leave this, but it's not the fix
            router.push(`/chat/${newConversationId}`);
        }else {
          // For guests, we just finish loading.
          setIsLoading(false);
        }
        // ===================================================
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setIsLoading(false);
      }
    })();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-4 space-y-6">
        {messages.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-fade-in px-4">
            <div className="space-y-6 max-w-4xl mx-auto">
              <h1 className="text-5xl sm:text-5xl lg:text-6xl font-black tracking-tight text-foreground">
                <span className="block leading-tight">
                  Transform Your Skills
                </span>
                <span className="block mt-2 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent animate-gradient-x">
                  Into Startup Gold
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Unlock your entrepreneurial potential. The better your prompt,
                the better the blueprint. Here&apos;s how to get a game-changing
                idea:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto w-full pt-4 text-left">
              <ProTip
                icon="🎯"
                title="Be Specific"
                description="Instead of 'I know code', say 'I'm skilled in Python and data analysis.'"
              />
              <ProTip
                icon="❤️‍🔥"
                title="Combine Skills & Passions"
                description="Mix tech with hobbies. 'I'm a React developer who loves sustainable farming.'"
              />
              <ProTip
                icon="🧐"
                title="Mention a Problem"
                description="Include a frustration. 'As a student, I struggle with finding quiet study spots.'"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                } animate-slide-up`}
              >
                <div
                  className={`max-w-[85%] rounded-3xl px-7 py-5 shadow-md transition-all duration-300 ${
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
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 sm:p-6 lg:p-6 pb-8 bg-gradient-to-t from-background via-background/95 to-transparent relative z-20">
        <div className="max-w-4xl mx-auto">
          <form ref={formRef} onSubmit={handleSubmit} className="relative">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-purple-600 rounded-3xl opacity-0 group-hover:opacity-20 blur-xl transition duration-500"></div>
              <div className="relative flex items-end gap-3 bg-card rounded-3xl shadow-2xl p-2 border-2 border-border transition-all duration-200 focus-within:border-primary focus-within:shadow-[0_0_0_4px_hsla(var(--primary),0.1)]">
                <TextareaAutosize
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Describe your skills, passions, or expertise..."
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
