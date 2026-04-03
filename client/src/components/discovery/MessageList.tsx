// src/components/discovery/MessageList.tsx
'use client';

import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { ThinkingPanel } from './ThinkingPanel';

export interface ChatMessage {
  id:      string;
  role:    'user' | 'assistant';
  content: string;
}

interface MessageListProps {
  messages:       ChatMessage[];
  isLoading:      boolean;
  isSynthesizing: boolean;
  synthesisError?: boolean;
  onRetry?:        () => void;
}

/**
 * MessageList
 *
 * Renders the scrollable chat message feed, typing indicator, and ThinkingPanel.
 */
export function MessageList({ messages, isLoading, isSynthesizing, synthesisError, onRetry }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-4 px-4">
      <AnimatePresence initial={false}>
        {messages.filter(m => m.content.trim()).map(msg => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={cn(
              'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
              msg.role === 'user'
                ? 'ml-auto bg-primary text-primary-foreground'
                : 'bg-muted text-foreground',
            )}
          >
            {msg.content}
          </motion.div>
        ))}
      </AnimatePresence>

      {isLoading && !isSynthesizing && (
        <div className="flex gap-1.5 items-center px-4 py-3 bg-muted rounded-2xl w-fit">
          {[0, 1, 2].map(i => (
            <motion.span
              key={i}
              className="size-1.5 bg-muted-foreground rounded-full"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      )}

      <ThinkingPanel isVisible={isSynthesizing || !!synthesisError} synthesisError={synthesisError} onRetry={onRetry} />
    </div>
  );
}
