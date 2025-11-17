// src/app/api/debug/test-frontend-ai/route.ts
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { AI_MODELS } from "@/lib/models";

export async function GET() {
  try {
    const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    // Test with a simple frontend task
    const testPrompt = `
You are a frontend agent. Generate a simple React component.

Task: Create a UserCard component that displays a user's name and email.

Tech Stack:
- Framework: React
- Language: TypeScript
- Styling: Tailwind CSS

Output as JSON:
{
  "files": [
    {
      "path": "src/components/UserCard.tsx",
      "content": "// Complete component code here"
    }
  ],
  "commands": [],
  "explanation": "Created UserCard component"
}
`;

    const response = await anthropic.messages.create({
      model: AI_MODELS.CLAUDE,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: testPrompt,
        },
      ],
    });

    // Extract text from content blocks
    const textContent = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    return NextResponse.json({
      success: true,
      model: AI_MODELS.CLAUDE,
      provider: "Anthropic",
      promptLength: testPrompt.length,
      responseLength: textContent.length,
      response: textContent,
      stopReason: response.stop_reason,
      usage: response.usage,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
