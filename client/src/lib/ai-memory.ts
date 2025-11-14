//src/ lib/ai-memory.ts
import "server-only";
import OpenAI from "openai";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client"; // <-- ADD THIS IMPORT
import { AI_MODELS } from "./models";
import { env } from "@/lib/env";

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY || "dummy-key-for-build",
});

/**
 * Creates a vector embedding from a piece of text.
 * @param text The text to embed
 * @returns {Promise<number[]>} An array of 1536 numbers
 */
async function createEmbedding(text: string): Promise<number[]> {
  // Runtime validation: Ensure API key is available
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is required for embedding generation");
  }
  
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
    if (!embedding) {
      throw new Error("OpenAI API returned an empty embedding.");
    }
    return embedding;
  } catch (error) {
    console.error("Error creating embedding:", error);
    throw new Error("Failed to create embedding with OpenAI.");
  }
}

/**
 * Saves a new memory to the AI Cofounder's long-term memory.
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
  try {
    // 1. Create the vector embedding from the content
    const embedding = await createEmbedding(content);

    // 2. Save to the database
    const vectorString = `[${embedding.join(",")}]`;

    // Use $executeRaw with template literals for automatic parameterization
    await prisma.$executeRaw`
      INSERT INTO "AiMemory" (id, content, embedding, "conversationId", "userId", "createdAt")
      VALUES (gen_random_uuid(), ${content}, ${vectorString}::vector(1536), ${conversationId}, ${userId}, NOW())
      ON CONFLICT DO NOTHING
    `;

    console.log(`🤖 Saved new memory for conversation ${conversationId}`);
  } catch (error) {
    // Log error but don't crash the main operation (e.g., chat response)
    console.error(
      "Error saving memory:",
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Searches the AI Cofounder's memory for relevant information.
 */
export async function searchMemory({
  query,
  conversationId,
  userId,
  limit = 5,
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

    // 2. Perform vector similarity search using raw SQL with Prisma.sql
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
    return []; // Return empty array on error
  }
}
