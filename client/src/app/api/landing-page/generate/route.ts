// src/app/api/landing-page/generate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  generateLandingPageContent,
  generateSlug,
  DESIGN_VARIANTS,
  LandingPageContent,
} from "lib/landing-page-generator";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { saveMemory } from "@/lib/ai-memory";
import { GoogleGenerativeAI } from "@google/generative-ai"; // <<< ADD AI Client
import { AI_MODELS } from "@/lib/models"; // <<< ADD AI Models

// --- ADD AI Client Init ---
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
// -------------------------
const generateRequestSchema = z.object({
  conversationId: z.string().cuid({ message: "Invalid Conversation ID" }),
  designVariantId: z.string().optional(),
});

type ConversationWithDetails = Prisma.ConversationGetPayload<{
  include: {
    messages: {
      where: { role: "model" };
      orderBy: { createdAt: "asc" };
      take: 1;
    };
    tags: { include: { tag: { select: { name: true } } } };
  };
}>;

// --- NEW: Pricing Tier Generation Function ---
interface PricingTier {
    name: string;
    price: string;
    description: string;
}

// --- NEW: Survey Question Generation Function ---
async function generateSurveyQuestions(blueprint: string): Promise<{ q1: string; q2: string }> {
    try {
        const model = genAI.getGenerativeModel({ model: AI_MODELS.FAST }); // Use the fast model
        const prompt = `
Based on this startup blueprint, generate two concise, high-impact survey questions to ask visitors after they sign up on a landing page.

RULES:
1. Question 1 must validate the core problem or pain point.
2. Question 2 must ask about their current solution or alternatives.
3. The questions must be short and easy to answer.
4. Return ONLY a valid JSON object in the format: {"q1": "Your first question here?", "q2": "Your second question here?"}

BLUEPRINT:
---
${blueprint}
---
JSON:`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        // Clean and parse JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("AI did not return valid JSON for survey questions.");
        }
        
        const parsed = JSON.parse(jsonMatch[0]) as { q1: string; q2: string };
        
        if (!parsed.q1 || !parsed.q2) {
             throw new Error("AI JSON missing q1 or q2 fields.");
        }

        return parsed;

    } catch (error) {
        console.error("Error generating survey questions:", error);
        // Return default fallback questions
        return {
            q1: "What's the #1 reason you signed up?",
            q2: "What are you using now to solve this problem?",
        };
    }
}
// ---------------------------------------------

async function generatePricingTiers(blueprint: string, targetMarket: "b2b" | "b2c"): Promise<PricingTier[]> {
    try {
        const model = genAI.getGenerativeModel({ model: AI_MODELS.FAST });
        const prompt = `
Based on this startup blueprint and its target market (${targetMarket}), generate three distinct pricing tiers.

RULES:
1.  Tier 1 should be a starter/basic plan (can be "Free" or low-cost).
2.  Tier 2 should be the "Pro" or "Most Popular" plan.
3.  Tier 3 should be a "Business" or "Enterprise" plan.
4.  Each tier must have a "name", a "price" (e.g., "$10/mo", "Free", "$99/mo", "Contact Us"), and a "description" (1-2 sentences).
5.  Return ONLY a valid JSON array in the format: [{"name": "...", "price": "...", "description": "..."}, ...]

BLUEPRINT:
---
${blueprint}
---
JSON:`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error("AI did not return valid JSON array for pricing.");
        }
        
        const parsed = JSON.parse(jsonMatch[0]) as PricingTier[];
        
        if (!parsed || parsed.length === 0) {
             throw new Error("AI returned empty pricing tiers.");
        }

        return parsed.slice(0, 3); // Ensure only 3 tiers

    } catch (error) {
        console.error("Error generating pricing tiers:", error);
        // Return default fallback tiers
        return [
            { name: "Starter", price: "$10/mo", description: "For individuals and hobbyists." },
            { name: "Pro", price: "$49/mo", description: "For professionals and small teams." },
            { name: "Business", price: "$199/mo", description: "For scaling companies." },
        ];
    }
}
// ---------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const userId = session.user.id;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const body = await req.json();

    const validation = generateRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", issues: validation.error.format() },
        { status: 400 }
      );
    }
    const { conversationId, designVariantId } = validation.data;

    const conversation: ConversationWithDetails | null =
      await prisma.conversation.findUnique({
        where: { id: conversationId, userId: userId },
        include: {
          messages: {
            where: { role: "model" },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
          tags: { include: { tag: { select: { name: true } } } },
        },
      });

    // --- FIX: Add explicit null check for conversation ---
    if (!conversation) {
      return new NextResponse("Conversation not found", { status: 404 });
    }
    // ---------------------------------------------------

    const blueprintMessage = conversation.messages?.[0];
    if (!blueprintMessage?.content) {
      return new NextResponse("Blueprint message not found", { status: 404 });
    }
    const blueprint = blueprintMessage.content;

    const targetMarket = conversation.tags.some(
      (t) => t.tag.name.toLowerCase() === "b2c"
    )
      ? "b2c"
      : "b2b";

    // --- Generate Content AND Survey Questions in Parallel ---
    const [content, surveyQuestions, pricingTiers] = await Promise.all([
      generateLandingPageContent(blueprint, conversation.title, targetMarket),
      generateSurveyQuestions(blueprint),
      generatePricingTiers(blueprint, targetMarket),
    ]);
    // -------------------------------------------------------

    const designVariant =
      DESIGN_VARIANTS.find((v) => v.id === designVariantId) ??
      DESIGN_VARIANTS[0];

    // --- FIX: Use safer casting for JSON fields ---
    const featuresJson = (content.features ?? {}) as Prisma.InputJsonValue;
    const colorSchemeJson = (designVariant.colorScheme ??
      {}) as Prisma.InputJsonValue;
    const pricingTiersJson = (pricingTiers ?? []) as unknown as Prisma.InputJsonValue; 
    const cleanBaseSlug = generateSlug(content.headline);

    const landingPage = await prisma.landingPage.upsert({
      where: { conversationId: conversationId },
      update: {
        headline: content.headline,
        subheadline: content.subheadline,
        problemStatement: content.problemStatement,
        solutionStatement: content.solutionStatement,
        features: featuresJson, // Use the casted value
        ctaText: content.ctaText,
        metaTitle: content.metaTitle,
        metaDescription: content.metaDescription,
        designVariant: designVariant.id,
        colorScheme: colorSchemeJson, // Use the casted value
        slug: cleanBaseSlug,
        surveyQuestion1: surveyQuestions.q1, // <<< SAVE Q1
        surveyQuestion2: surveyQuestions.q2, // <<< SAVE Q2
        pricingTiers: pricingTiersJson,
      },
      create: {
        userId: userId,
        conversationId,
        slug: cleanBaseSlug,
        title: conversation.title,
        headline: content.headline,
        subheadline: content.subheadline,
        problemStatement: content.problemStatement,
        solutionStatement: content.solutionStatement,
        features: featuresJson, // Use the casted value
        ctaText: content.ctaText,
        metaTitle: content.metaTitle,
        metaDescription: content.metaDescription,
        designVariant: designVariant.id,
        colorScheme: colorSchemeJson, // Use the casted value
        surveyQuestion1: surveyQuestions.q1, // <<< SAVE Q1
        surveyQuestion2: surveyQuestions.q2, // <<< SAVE Q2
        pricingTiers: pricingTiersJson,
      },
      select: { id: true },
    });

    // --- 👇 2. SAVE LANDING PAGE CONTENT AS MEMORY ---
    // Format a concise summary of the generated content
    const memoryContent = `Generated Landing Page Content:
Headline: ${content.headline}
Subheadline: ${content.subheadline}
Problem: ${content.problemStatement ?? "N/A"}
Solution: ${content.solutionStatement ?? "N/A"}
CTA: ${content.ctaText}`;

    // Run without 'await' so it doesn't block the response
    void saveMemory({
      content: memoryContent,
      conversationId: conversationId,
      userId: userId,
    });

    return NextResponse.json({ success: true, landingPage });
  } catch (error: unknown) {
    // Type the catch parameter
    console.error("[LP_GENERATE_ERROR]", error);
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
