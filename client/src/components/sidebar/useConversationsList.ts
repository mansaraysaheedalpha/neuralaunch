'use client';
// src/components/sidebar/useConversationsList.ts

import useSWR from 'swr';

export interface SidebarConversation {
  id: string;
  title: string;
  updatedAt: string;
  /**
   * Status of the linked DiscoverySession, when present. Drives the
   * sidebar route: ACTIVE sessions go to /discovery so the founder
   * lands inside the live interview with the resume hand-off, not
   * the read-only transcript at /chat/[id].
   */
  discoveryStatus?: 'ACTIVE' | 'COMPLETE' | 'EXPIRED' | null;
}

interface ConversationsApiResponse {
  success: boolean;
  data:    SidebarConversation[];
}

const fetcher = async (url: string): Promise<SidebarConversation[]> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch conversations');
  const json = await res.json() as ConversationsApiResponse;
  return json.data ?? [];
};

export interface UseConversationsListResult {
  conversations: SidebarConversation[];
  isLoading:     boolean;
  error:         Error | null;
  /** Optimistically remove a deleted conversation from the cache. */
  removeFromCache: (id: string) => void;
}

/**
 * useConversationsList
 *
 * Fetches the founder's recent conversations via SWR. Replaces the
 * previous useEffect+fetch+zustand pattern in Sidebar.tsx.
 *
 * SWR gives us:
 *   - Cache + dedup so multiple sidebar mounts (mobile + desktop)
 *     do not double-fetch
 *   - Automatic revalidation on focus / reconnect
 *   - Optimistic delete via mutate() instead of a manual store sync
 *
 * The 'authenticated' guard is the responsibility of the consumer —
 * this hook is unconditional. Pass a null key (`undefined`) when
 * status is not 'authenticated' to skip the request entirely.
 */
export function useConversationsList(enabled: boolean): UseConversationsListResult {
  const { data, error, isLoading, mutate } = useSWR<SidebarConversation[]>(
    enabled ? '/api/conversations' : null,
    fetcher,
  );

  const removeFromCache = (id: string) => {
    void mutate(
      current => (current ?? []).filter(c => c.id !== id),
      { revalidate: false },
    );
  };

  return {
    conversations: data ?? [],
    isLoading:     isLoading && enabled,
    error:         error instanceof Error ? error : null,
    removeFromCache,
  };
}
