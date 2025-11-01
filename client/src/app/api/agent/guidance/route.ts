// src/app/api/agent/guidance/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import { logger } from "@/lib/logger";

const guidanceRequestSchema = z.object({
  service: z.string().min(1).max(50),
});

export async function GET(request: NextRequest) {
  const log = logger.child({ api: "/api/agent/guidance" });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      log.warn("Unauthorized guidance request attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const validation = guidanceRequestSchema.safeParse({
      service: searchParams.get("service"),
    });

    if (!validation.success) {
      log.error("Invalid 'service' parameter.", validation.error);
      return NextResponse.json(
        {
          error: "Invalid 'service' parameter",
          issues: validation.error.format(),
        },
        { status: 400 }
      );
    }
    const { service } = validation.data;
    log.info(`Guidance request received for service: ${service}`);

    // --- UPDATED PROMPT: Removed 150-word limit, asking for professional Markdown ---
    const guidancePrompt = `
You are an expert developer assistant. A user is asking how to get an API key or secret.
The service identifier is: "${service}".

**Task:**
Provide clear, professional, step-by-step instructions on how a developer can obtain this value.
* Use web search to find the most current flow and official documentation links.
* Focus on the standard flow within the relevant service's dashboard (e.g., Stripe Dashboard, Google Cloud Console).
* Format the output as clean, legible Markdown (e.g., numbered lists, bullet points).
* **Crucially, embed clickable markdown links** to the *exact* dashboard page (e.g., \`[Stripe API Keys](https://dashboard.stripe.com/apikeys)\`).
* If the identifier is generic (like "database_url_generic"), provide general advice on where users get connection strings (e.g., from their database provider like Neon, Supabase, etc.).
* If the identifier is for generating a secret (like "nextauth_secret_generation"), provide the standard \`openssl rand -base64 32\` command in a code block.

Do not add any conversational intro or outro. Respond only with the instructional Markdown.
`;
    // --- END UPDATED PROMPT ---

    log.info(`Requesting guidance from AI for service: ${service}`);
    const guidanceResponse = await executeAITaskSimple(
      AITaskType.GET_API_KEY_GUIDANCE,
      {
        prompt: guidancePrompt,
      }
    );

    if (!guidanceResponse || guidanceResponse.trim() === "") {
      log.warn(`AI returned empty guidance for service: ${service}`);
      return NextResponse.json(
        {
          guidance:
            "Sorry, I couldn't find specific instructions for that key right now.",
        },
        { status: 200 }
      );
    }

    log.info(`Guidance generated successfully for service: ${service}`);
    return NextResponse.json({ guidance: guidanceResponse }, { status: 200 });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error fetching guidance";
    log.error(
      `Error: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
    return NextResponse.json(
      { error: "Internal Server Error", message: errorMessage },
      { status: 500 }
    );
  }
}
