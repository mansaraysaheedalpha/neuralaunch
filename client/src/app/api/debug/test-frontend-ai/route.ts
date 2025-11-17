// src/app/api/debug/test-frontend-ai/route.ts
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";
import { AI_MODELS } from "@/lib/models";

export async function GET() {
  try {
    const ai = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY });

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

    const response = await ai.models.generateContent({
      model: AI_MODELS.CLAUDE, // Using Claude like FrontendAgent does
      contents: [{ parts: [{ text: testPrompt }] }],
      config: {
        temperature: 0.3,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    });

    const text = response.text || "";

    return NextResponse.json({
      success: true,
      model: AI_MODELS.CLAUDE,
      promptLength: testPrompt.length,
      responseLength: text.length,
      response: text,
      finishReason: response.candidates?.[0]?.finishReason,
      safetyRatings: response.candidates?.[0]?.safetyRatings,
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
