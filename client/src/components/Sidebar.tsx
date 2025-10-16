"use client";

import { Fragment, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useSession } from "next-auth/react";

interface SidebarProps {
  isSidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
  isMobileMenuOpen: boolean;
  setMobileMenuOpen: (isOpen: boolean) => void;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInHours = diffInMs / (1000 * 60 * 60);

  if (diffInHours < 24) {
    return `${Math.floor(diffInHours)}h ago`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

export default function Sidebar({
  isSidebarOpen,
  setSidebarOpen,
  isMobileMenuOpen,
  setMobileMenuOpen,
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    const fetchConversations = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/conversations");
        if (!response.ok) throw new Error("Failed to fetch conversations");
        const data = await response.json();
        setConversations(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    if (status === "authenticated") {
      fetchConversations();
    } else if (status === "unauthenticated") {
      setConversations([]);
      setError(null);
    }
  }, [status, setConversations, setIsLoading, setError]);

  const handleDelete = async (conversationId: string) => {
    setDeletingId(conversationId);
    try {
      await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
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

  const sidebarContent = (
    <div className="flex flex-col h-full bg-card text-card-foreground border-r border-border">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0 flex items-center gap-2">
        <Link
          href="/"
          onClick={() => setMobileMenuOpen(false)}
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
          className="w-10 h-10 hidden md:flex items-center justify-center rounded-lg hover:bg-muted"
          aria-label="Collapse sidebar"
        >
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
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="w-10 h-10 md:hidden flex items-center justify-center rounded-lg hover:bg-muted"
          aria-label="Close menu"
        >
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <div className="p-2">
        <Link
          href="/trends"
          onClick={() => setMobileMenuOpen(false)}
          className={`group relative flex items-center px-3 py-3 rounded-xl transition-all duration-200 ${
            pathname === "/trends" ? "bg-primary/10" : "hover:bg-muted"
          }`}
        >
          {pathname === "/trends" && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full"></div>
          )}
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-all duration-200 ${
              pathname === "/trends"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
            }`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium truncate ${
                pathname === "/trends"
                  ? "text-primary font-semibold"
                  : "text-foreground"
              }`}
            >
              Spark Index
            </p>
          </div>
          <span className="flex-shrink-0 px-2 py-0.5 bg-primary text-primary-foreground text-xs font-bold rounded-full">
            NEW
          </span>
        </Link>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 border-t border-border">
        {status === "authenticated" && conversations.length > 0 && (
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
            Recent Chats
          </h2>
        )}
        {isLoading && status === "authenticated" ? (
          <div className="space-y-2 p-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-10 bg-muted rounded-lg animate-pulse"
              ></div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => {
              const isActive = pathname === `/chat/${conversation.id}`;
              return (
                <Link
                  key={conversation.id}
                  href={`/chat/${conversation.id}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`group relative flex items-center px-3 py-2.5 rounded-lg transition-colors ${
                    isActive ? "bg-muted" : "hover:bg-muted"
                  }`}
                >
                  <p className="text-sm text-foreground truncate flex-1">
                    {conversation.title}
                  </p>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(conversation.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                    disabled={deletingId === conversation.id}
                  >
                    {/* Delete Icon SVG */}
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
                </Link>
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

  const collapsedSidebarContent = (
    <div className="flex flex-col h-full bg-card text-card-foreground border-r border-border p-2 pt-4 items-center">
      <button
        onClick={() => setSidebarOpen(true)}
        className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary text-primary-foreground mb-4 transition-transform hover:scale-105"
        aria-label="Expand sidebar"
      >
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
      <Link
        href="/trends"
        className={`group relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
          pathname === "/trends"
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted text-muted-foreground"
        }`}
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
        </svg>
      </Link>
    </div>
  );

  return (
    <Fragment>
      {/* MOBILE SIDEBAR OVERLAY */}
      <div
        className={`md:hidden fixed inset-0 z-40 ${
          isMobileMenuOpen ? "block" : "hidden"
        }`}
      >
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        ></div>
        <div className="relative w-80 h-full bg-card flex flex-col">
          {sidebarContent}
        </div>
      </div>
      {/* DESKTOP SIDEBAR CONTAINER */}
      <div
        className={`hidden md:flex flex-col h-full transition-all duration-300 ${
          isSidebarOpen ? "w-80" : "w-20"
        }`}
      >
        {isSidebarOpen ? sidebarContent : collapsedSidebarContent}
      </div>
    </Fragment>
  );
}
