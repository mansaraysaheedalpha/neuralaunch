"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Conversation type definition
type Conversation = {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
};

export default function Sidebar() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [mounted, setMounted] = useState<boolean>(false);
  const pathname = usePathname();

  // Fix hydration by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/conversations");

        if (!response.ok) {
          throw new Error("Failed to fetch conversations");
        }

        const data = await response.json();
        setConversations(data.conversations || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        console.error("Error fetching conversations:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConversations();
  }, []);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950 border-r border-gray-800">
      {/* Header with New Chat Button */}
      <div className="p-4">
        <Link
          href="/"
          className="flex items-center justify-center w-full px-4 py-3.5 bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 hover:from-violet-500 hover:via-purple-500 hover:to-indigo-500 text-white rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-violet-500/20 hover:shadow-xl hover:shadow-violet-500/30 transform hover:scale-[1.02] active:scale-[0.98] group"
        >
          <svg
            className="w-5 h-5 mr-2 group-hover:rotate-90 transition-transform duration-200"
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
          <span>New Chat</span>
        </Link>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        {!mounted ? (
          // Initial loading state (prevents hydration mismatch)
          <div className="space-y-2">
            {[...Array(10)].map((_, index) => (
              <div key={index} className="h-14 bg-gray-800/50 rounded-lg"></div>
            ))}
          </div>
        ) : isLoading ? (
          // Loading Skeleton
          <div className="space-y-2">
            {[...Array(10)].map((_, index) => (
              <div
                key={index}
                className="animate-pulse"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="h-14 bg-gray-800/50 rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          // Error State
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <svg
              className="w-10 h-10 text-gray-600 mb-3"
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
            <p className="text-xs text-gray-500">{error}</p>
          </div>
        ) : conversations.length === 0 ? (
          // Empty State
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-14 h-14 bg-gradient-to-br from-violet-900/30 to-indigo-900/30 rounded-2xl flex items-center justify-center mb-3 ring-1 ring-violet-500/20">
              <svg
                className="w-7 h-7 text-violet-400"
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
            <p className="text-sm font-medium text-gray-300 mb-1">
              No conversations yet
            </p>
            <p className="text-xs text-gray-500">Start a new chat to begin</p>
          </div>
        ) : (
          // Conversation List
          <div className="space-y-1">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2 mb-1">
              Recent Chats
            </h2>
            {conversations.map((conversation) => {
              const isActive = pathname === `/chat/${conversation.id}`;

              return (
                <Link
                  key={conversation.id}
                  href={`/chat/${conversation.id}`}
                  className={`
                    group flex items-center px-3 py-3.5 rounded-lg transition-all duration-150
                    ${
                      isActive
                        ? "bg-gradient-to-r from-violet-600/20 to-indigo-600/20 border-l-[3px] border-violet-500 shadow-lg shadow-violet-500/10"
                        : "hover:bg-gray-800/50 border-l-[3px] border-transparent hover:border-gray-700"
                    }
                  `}
                >
                  {/* Chat Icon */}
                  <div
                    className={`
                    flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mr-3 transition-all duration-150
                    ${
                      isActive
                        ? "bg-violet-600/30 ring-2 ring-violet-500/30"
                        : "bg-gray-800 group-hover:bg-gray-700"
                    }
                  `}
                  >
                    <svg
                      className={`w-4.5 h-4.5 ${
                        isActive
                          ? "text-violet-400"
                          : "text-gray-400 group-hover:text-gray-300"
                      }`}
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

                  {/* Chat Title */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`
                      text-sm font-medium truncate
                      ${
                        isActive
                          ? "text-violet-100"
                          : "text-gray-300 group-hover:text-white"
                      }
                    `}
                    >
                      {conversation.title}
                    </p>
                    {conversation.updated_at && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDate(conversation.updated_at)}
                      </p>
                    )}
                  </div>

                  {/* Active Indicator */}
                  {isActive && (
                    <div className="flex-shrink-0 w-2 h-2 bg-violet-500 rounded-full shadow-lg shadow-violet-500/50"></div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center space-x-3 px-3 py-3 bg-gray-800/50 rounded-xl hover:bg-gray-800/70 transition-colors cursor-pointer group">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg ring-2 ring-violet-500/20">
            IS
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate group-hover:text-violet-300 transition-colors">
              IdeaSpark
            </p>
            <p className="text-xs text-gray-500">AI Assistant</p>
          </div>
          <svg
            className="w-4 h-4 text-gray-500 group-hover:text-gray-400 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </div>
  );
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
    const hours = Math.floor(diffInHours);
    return `${hours}h ago`;
  } else if (diffInDays < 7) {
    const days = Math.floor(diffInDays);
    return `${days}d ago`;
  } else if (diffInDays < 30) {
    const weeks = Math.floor(diffInDays / 7);
    return `${weeks}w ago`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}
