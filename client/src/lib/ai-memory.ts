//src/lib/ai - memory.ts;
import "server-only";
import OpenAI from "openai";
import prisma from "@/lib/prisma";
import { AI_MODELS } from "./models"; // <-- Integrates with your file

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Creates a vector embedding from a piece of text.
 * @param text The text to embed
 * @returns {Promise<number[]>} An array of 1536 numbers
 */
async function createEmbedding(text: string): Promise<number[]> {
  // 1. Clean up the text
  const inputText = text.trim().replaceAll("\n", " ");

  // 2. Call the OpenAI API
  try {
    const response = await openai.embeddings.create({
      model: AI_MODELS.EMBEDDING, // <-- Uses your config file
      input: inputText,
      dimensions: 1536, // Explicitly set dimensions
    });

    // 3. Get the embedding (the list of numbers)
    const embedding = response.data[0].embedding;
    return embedding;
  } catch (error) {
    console.error("Error creating embedding:", error);
    throw new Error("Failed to create embedding with OpenAI.");
  }
}

/**
 * Saves a new memory to the AI Cofounder's long-term memory.
 * This is the function we'll call from our APIs.
 */
export async function saveMemory({
  content,
  conversationId,
  userId,
}: {
  content: string;
  conversationId: string;
  userId: string;
}) {
  // 1. Create the vector embedding from the content
  const embedding = await createEmbedding(content);

  // 2. Save to the database
  // Because we used the `Unsupported` type, we must use raw SQL.
  const vectorString = `[${embedding.join(",")}]`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "AiMemory" (id, content, embedding, "conversationId", "userId", "createdAt")
     VALUES (gen_random_uuid(), $1, $2::vector(1536), $3, $4, NOW())
     ON CONFLICT DO NOTHING`, // Add this to prevent errors if we accidentally save the same thing
    content,
    vectorString,
    conversationId,
    userId
  );

  console.log(`🤖 Saved new memory for conversation ${conversationId}`);
}

/**
 * Searches the AI Cofounder's memory for relevant information.
 * @param query The user's question or topic to search for.
 * @param conversationId The ID of the current conversation.
 * @param limit The maximum number of memories to retrieve.
 * @returns {Promise<string[]>} An array of the most relevant memory content strings.
 */
export async function searchMemory({
  query,
  conversationId,
  userId, // Add userId for security/filtering
  limit = 5, // Default to retrieving top 5 memories
}: {
  query: string;
  conversationId: string;
  userId: string;
  limit?: number;
}): Promise<string[]> {
  try {
    // 1. Create an embedding for the user's query
    const queryEmbedding = await createEmbedding(query);
    const vectorString = `[${queryEmbedding.join(",")}]`;

    // 2. Perform vector similarity search using raw SQL
    // We use `<=>` (cosine distance) operator from pg_vector
    // to find the closest vectors. Lower distance = more similar.
    // Ensure you only search memories for the correct user and conversation.
    const results = await prisma.$queryRaw<Array<{ content: string }>>(
      Prisma.sql`
        SELECT content
        FROM "AiMemory"
        WHERE "conversationId" = ${conversationId}
          AND "userId" = ${userId}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorString}::vector(1536)
        LIMIT ${limit}
      `
    );

    // 3. Return just the text content of the relevant memories
    return results.map((result) => result.content);

  } catch (error) {
    console.error("Error searching memory:", error);
    // Return empty array on error, so the agent can still try to answer
    return [];
  }
}