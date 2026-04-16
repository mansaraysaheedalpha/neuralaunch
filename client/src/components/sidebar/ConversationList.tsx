'use client';
// src/components/sidebar/ConversationList.tsx

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import type { SidebarConversation } from './useConversationsList';

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInSeconds < 60) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export interface ConversationListProps {
  conversations: SidebarConversation[];
  isLoading:     boolean;
  isAuthed:      boolean;
  onClose:       () => void;
  onDelete:      (id: string) => void;
}

/**
 * ConversationList — recent conversations rail in the sidebar.
 *
 * Pure presentation + a delete handler. The optimistic-update logic
 * lives in the parent (via the useConversationsList hook), so this
 * component just calls onDelete and trusts the parent to remove
 * the row from the cache.
 *
 * In-progress sessions route to /discovery instead of /chat/[id]
 * so the founder lands inside the live interview with the resume
 * hand-off, not the read-only transcript with no input box.
 */
export function ConversationList({
  conversations,
  isLoading,
  isAuthed,
  onClose,
  onDelete,
}: ConversationListProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(conversationId: string) {
    setDeletingId(conversationId);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete conversation');
      onDelete(conversationId);
      if (pathname === `/chat/${conversationId}`) {
        router.push('/');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!isAuthed || conversations.length === 0) return null;

  return (
    <>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
        Recent Chats
      </h2>
      <div className="space-y-1">
        {conversations.map((conversation) => {
          const isInProgress = conversation.discoveryStatus === 'ACTIVE';
          const href = isInProgress ? '/discovery' : `/chat/${conversation.id}`;
          const isActive = pathname === href || pathname === `/chat/${conversation.id}`;
          return (
            <Link
              key={conversation.id}
              href={href}
              onClick={onClose}
              className={`group relative flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 ${
                isActive ? 'bg-primary/10' : 'hover:bg-muted'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${
                  isActive ? 'text-primary font-semibold' : 'text-foreground'
                }`}>
                  {conversation.title}
                </p>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-muted-foreground">
                    {formatDate(conversation.updatedAt)}
                  </p>
                  {isInProgress && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-gold">
                      <span className="size-1 rounded-full bg-gold animate-pulse" />
                      In progress
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleDelete(conversation.id);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                disabled={deletingId === conversation.id}
              >
                {deletingId === conversation.id ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </Link>
          );
        })}
      </div>
    </>
  );
}
