// src/lib/discovery/stream-tee.ts
import 'server-only';
import prisma from '@/lib/prisma';

/**
 * teeDiscoveryStream
 *
 * Pipes a Vercel AI SDK textStream to the client while persisting the
 * accumulated response as an assistant Message in the linked Conversation.
 *
 * Returns a ReadableStream<Uint8Array> suitable for a NextResponse body.
 * The Message write is best-effort — failures are swallowed.
 */
export function teeDiscoveryStream(
  textStream:     ReadableStream<string>,
  conversationId: string | null,
): ReadableStream<Uint8Array> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();
  const chunks: string[] = [];

  void textStream.pipeTo(
    new WritableStream({
      write(chunk) {
        chunks.push(chunk);
        void writer.write(encoder.encode(chunk));
      },
      close() {
        void writer.close().then(async () => {
          const fullText = chunks.join('');
          if (fullText && conversationId) {
            await prisma.message.create({
              data: { conversationId, role: 'assistant', content: fullText },
            }).catch(() => { /* non-fatal */ });
          }
        });
      },
    }),
  );

  return readable;
}
