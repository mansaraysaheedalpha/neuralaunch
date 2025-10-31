// src/app/api/agent/guidance/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth"; // Assuming auth is needed to prevent abuse, optional
import { z } from "zod";
import { AITaskType, executeAITaskSimple } from "@/lib/ai-orchestrator";
import { logger } from "@/lib/logger";

// Input validation schema for the query parameter
const guidanceRequestSchema = z.object({
  service: z.string().min(1).max(50), // e.g., "stripe_sk", "google_oauth_client_id"
});


// --- API Route Handler ---
export async function GET(request: NextRequest) {
  const log = logger.child({ api: "/api/agent/guidance" });

  try {
    // 1. --- Optional Authentication (Recommended) ---
    const session = await auth();
    if (!session?.user?.id) {
      log.warn("Unauthorized guidance request attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. --- Input Validation ---
    const { searchParams } = new URL(request.url);
    const serviceParam = searchParams.get("service");

    const validation = guidanceRequestSchema.safeParse({
      service: serviceParam,
    });
    if (!validation.success) {
      log.error(
        `Invalid 'service' parameter provided. param=${serviceParam} issues=${JSON.stringify(validation.error.format())}`
      );
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

    // 3. --- Construct AI Prompt ---
    // Tailor the prompt for conciseness and web search context
    const guidancePrompt = `
You are an AI assistant helping a user configure environment variables for their web application deployment.
The user needs help finding a specific API key or secret identified as: "${service}".

**Task:**
Provide concise, up-to-date, step-by-step instructions (max 3-4 steps) on how a developer typically obtains the "${service}" value.
* Focus on the standard flow within the relevant service's dashboard (e.g., Stripe Dashboard, Google Cloud Console, GitHub Settings).
* If possible, include a direct link to the relevant section of the service's website/dashboard. Use web search to find the most current link and information.
* Keep the total response brief and easy to follow, ideally under 150 words.
* Format the output using simple markdown (like bullet points or numbered lists). Do not use code blocks.
* If the identifier is generic (like "database_url_generic"), provide general advice on where users typically get database connection strings (e.g., from their database provider like Vercel Postgres, Neon, Supabase, AWS RDS).
* If the identifier is for generating a secret (like "nextauth_secret_generation"), provide the standard \`openssl rand -base64 32\` command.

**Example for "stripe_sk":**
1. Log in to your Stripe Dashboard.
2. Navigate to the "Developers" section, then "API keys".
3. Find your "Secret key" (it starts with \`sk_live_\` or \`sk_test_\`). Copy it carefully.
4. Link: https://dashboard.stripe.com/apikeys
`;

    // 4. --- Call AI Orchestrator (Route to Gemini + Search) ---
    log.info(`Requesting guidance from AI for service: ${service}`);
    const guidanceResponse = await executeAITaskSimple(
      AITaskType.GET_API_KEY_GUIDANCE, // Make sure this is added to your enum and orchestrator routing
      {
        prompt: guidancePrompt,
        // You might need specific parameters in your orchestrator to enable search
        // e.g., enableSearchTool: true (depending on your implementation)
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

    // 5. --- Return Guidance ---
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

