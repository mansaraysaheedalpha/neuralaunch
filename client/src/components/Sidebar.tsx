"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { useSession } from "next-auth/react";

interface SidebarProps {
  isSidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
}

// Helper function to format dates
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInHours = diffInMs / (1000 * 60 * 60);
  const diffInDays = diffInHours / 24;

  if (diffInHours < 1) {
    const minutes = Math.floor(diffInMs / (1000 * 60));
    return minutes < 1 ? "Just now" : `${minutes}m ago`;
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)}h ago`;
  } else if (diffInDays < 7) {
    return `${Math.floor(diffInDays)}d ago`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

export default function Sidebar({
  isSidebarOpen,
  setSidebarOpen,
}: SidebarProps) {
  const {
    conversations,
    setConversations,
    removeConversation,
    isLoading,
    setIsLoading,
    error,
    setError,
  } = useStore();

  const [mounted, setMounted] = useState<boolean>(false);
  const pathname = usePathname();
  // const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { status } = useSession();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDelete = async (conversationId: string) => {
    setDeletingId(conversationId);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete conversation.");
      }

      removeConversation(conversationId);

      if (pathname === `/chat/${conversationId}`) {
        router.push("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setDeletingId(null);
    }
  };

  // Fix hydration by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchConversations = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/conversations");

        if (!response.ok) {
          throw new Error("Failed to fetch conversations");
        }

        const data = await response.json();
        setConversations(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        console.error("Error fetching conversations:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (status === "authenticated") {
      // Only fetch if the user is logged in
      fetchConversations();
    } else if (status === "unauthenticated") {
      // If logged out, just clear the list and don't show an error
      setConversations([]);
      setError(null);
    }
  }, [status, setConversations, setIsLoading, setError]);

  if (!isSidebarOpen) {
    return (
      <div className="flex flex-col h-full bg-card text-card-foreground border-r border-border p-2 pt-4 items-center">
        <button
          onClick={() => setSidebarOpen(true)}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground mb-4 transition-transform hover:scale-105"
          aria-label="Expand sidebar"
        >
          {/* Expand Icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card text-card-foreground border-r border-border">
      {/* 1. FIXED HEADER with Collapse Button */}
      <div className="p-4 border-b border-border flex-shrink-0 flex items-center gap-2">
        <Link
          href="/"
          className="flex-1 flex items-center justify-center px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transform hover:scale-[1.02] active:scale-[0.98] group"
        >
          <svg
            className="w-5 h-5 mr-2 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="truncate">New Chat</span>
        </Link>
        <button
          onClick={() => setSidebarOpen(false)}
          className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-muted"
          aria-label="Collapse sidebar"
        >
          {/* Collapse Icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        {!mounted || (isLoading && conversations.length === 0) ? (
          // FIX: Themed loading skeleton
          <div className="space-y-2 p-2">
            {[...Array(8)].map((_, index) => (
              <div
                key={index}
                className="animate-pulse"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="h-12 bg-muted rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          // FIX: Themed error state
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <svg
              className="w-10 h-10 text-muted-foreground mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : conversations.length === 0 ? (
          // FIX: Themed empty state for logged-in users
          status === "authenticated" && (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4 ring-1 ring-border">
                <svg
                  className="w-8 h-8 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">
                No conversations yet
              </p>
              <p className="text-xs text-muted-foreground">
                Start a new chat to begin your history.
              </p>
            </div>
          )
        ) : (
          // Conversation List
          <div className="space-y-1">
            {conversations.map((conversation) => {
              const isActive = pathname === `/chat/${conversation.id}`;
              return (
                <div key={conversation.id} className="relative group">
                  <Link
                    href={`/chat/${conversation.id}`}
                    className={`flex items-center w-full px-3 py-3 rounded-lg transition-colors duration-150 ${
                      isActive ? "bg-primary/10" : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${
                          isActive ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {conversation.title}
                      </p>
                      {conversation.updatedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(conversation.updatedAt)}
                        </p>
                      )}
                    </div>
                  </Link>
                  {/* FIX: Themed delete button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(conversation.id);
                    }}
                    disabled={deletingId === conversation.id}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground bg-transparent opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-500/10 transition-all"
                    aria-label="Delete chat"
                  >
                    {deletingId === conversation.id ? (
                      <svg
                        className="w-4 h-4 animate-spin"
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
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-border flex-shrink-0">
        <div className="flex items-center space-x-2 p-2 rounded-xl">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold">
            IS
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              IdeaSpark
            </p>
            <p className="text-xs text-muted-foreground">AI Assistant</p>
          </div>
        </div>
      </div>
    </div>
  );
}
