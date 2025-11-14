// client/lib/landing-page-generator.ts
// CORRECT VERSION - Based on official @google/genai v1.28.0 documentation

import { AI_MODELS } from "@/lib/models";
import { GoogleGenAI } from "@google/genai";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { env } from "@/lib/env";

// Initialize the Google Gen AI client
const genAI = new GoogleGenAI({
  apiKey: env.GOOGLE_API_KEY || "",
});

const landingPageContentSchema = z.object({
  headline: z.string().min(1),
  subheadline: z.string().min(1),
  problemStatement: z.string().min(1),
  solutionStatement: z.string().min(1),
  features: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        icon: z.string().min(1),
      })
    )
    .length(3),
  ctaText: z.string().min(1),
  metaTitle: z.string().min(1),
  metaDescription: z.string().min(1),
});

export type LandingPageContent = z.infer<typeof landingPageContentSchema>;

export interface DesignVariant {
  id: string;
  name: string;
  description: string;
  colorScheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  personality: string;
}

export const DESIGN_VARIANTS: DesignVariant[] = [
  {
    id: "professional",
    name: "Professional B2B",
    description: "Clean, corporate, trustworthy - perfect for B2B SaaS",
    colorScheme: {
      primary: "#2563eb",
      secondary: "#1e40af",
      accent: "#3b82f6",
      background: "#ffffff",
      text: "#1f2937",
    },
    personality: "serif fonts, structured layout, subtle animations",
  },
  {
    id: "playful",
    name: "Playful B2C",
    description: "Fun, colorful, energetic - perfect for consumer apps",
    colorScheme: {
      primary: "#ec4899",
      secondary: "#f59e0b",
      accent: "#8b5cf6",
      background: "#fef3c7",
      text: "#1f2937",
    },
    personality: "rounded corners, bold fonts, playful animations",
  },
  {
    id: "minimalist",
    name: "Minimalist Tech",
    description: "Simple, elegant, modern - perfect for productivity tools",
    colorScheme: {
      primary: "#000000",
      secondary: "#374151",
      accent: "#6b7280",
      background: "#ffffff",
      text: "#111827",
    },
    personality: "sans-serif, whitespace, subtle transitions",
  },
  {
    id: "bold",
    name: "Bold & Vibrant",
    description: "Eye-catching, confident, modern - perfect for disruptors",
    colorScheme: {
      primary: "#dc2626",
      secondary: "#ea580c",
      accent: "#f59e0b",
      background: "#1f2937",
      text: "#f9fafb",
    },
    personality: "large typography, high contrast, dramatic",
  },
  {
    id: "calm",
    name: "Calm & Trustworthy",
    description: "Soothing, professional, healthcare-friendly",
    colorScheme: {
      primary: "#059669",
      secondary: "#0d9488",
      accent: "#06b6d4",
      background: "#f0fdf4",
      text: "#064e3b",
    },
    personality: "soft colors, gentle animations, approachable",
  },
];

function getLandingPagePrompt(
  blueprint: string,
  targetMarket: string,
  startupTitle: string
): string {
  return `You are a world-class copywriter who has written landing pages for Stripe, Notion, and Linear.

STARTUP NAME: ${startupTitle}

STARTUP BLUEPRINT:
${blueprint}

TARGET MARKET: ${targetMarket}

YOUR TASK: Create a high-converting landing page that follows these proven principles:

1. HEADLINE (8-12 words):
   - Start with a verb or power word
   - Promise a clear benefit
   - Create curiosity or urgency
   - Examples: "Build your startup in 72 hours, not 6 months"
   - Avoid: Generic phrases like "Welcome to..." or "The best..."

2. SUBHEADLINE (15-20 words):
   - Expand on the headline
   - Address the pain point directly
   - Show transformation (before → after)
   - Be specific with numbers/timeframes

3. PROBLEM STATEMENT (2-3 sentences):
   - Describe the painful status quo
   - Use emotional language
   - Show you understand their struggle

4. SOLUTION STATEMENT (2-3 sentences):
   - Explain your unique approach
   - Focus on HOW it's different
   - Use concrete examples

5. FEATURES (3 features):
   - Each feature = benefit (not capability)
   - 15-20 words per description
   - Include specific outcomes
   - Use power words (fast, easy, proven, guaranteed)
   - Choose relevant emojis for icons

6. CTA (2-4 words):
   - Action-oriented
   - Create urgency
   - Examples: "Start Free Trial", "Join Waitlist", "Get Early Access"

7. SEO (Meta tags):
   - Title: 50-60 characters with main keyword
   - Description: 140-160 characters with benefit + action

TONE: ${
    targetMarket === "b2b"
      ? "Professional but approachable. Confident and data-driven."
      : "Friendly and energetic. Conversational and exciting."
  }

CRITICAL: Return ONLY valid JSON. No markdown, no explanations, just the JSON object.

JSON FORMAT:
{
  "headline": "...",
  "subheadline": "...",
  "problemStatement": "...",
  "solutionStatement": "...",
  "features": [
    {"title": "...", "description": "...", "icon": "⚡"},
    {"title": "...", "description": "...", "icon": "🚀"},
    {"title": "...", "description": "...", "icon": "💎"}
  ],
  "ctaText": "...",
  "metaTitle": "...",
  "metaDescription": "..."
}`;
}

export async function generateLandingPageContent(
  blueprint: string,
  startupTitle: string,
  targetMarket: "b2b" | "b2c" = "b2b"
): Promise<LandingPageContent> {
  try {
    const prompt = getLandingPagePrompt(blueprint, targetMarket, startupTitle);

    // Official Google Gen AI SDK pattern for Gemini 2.0
    const result = await genAI.models.generateContent({
      model: AI_MODELS.FAST,
      contents: prompt,
    });

    // Extract text from response
    const text = result.text;

    if (!text) {
      throw new Error("No text content in AI response");
    }

    return processAIResponse(text, startupTitle);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Generation error:", errorMessage);
    console.log("⚠️ Using fallback content generation...");
    return generateFallbackContent(startupTitle);
  }
}

function processAIResponse(
  text: string,
  _startupTitle: string
): LandingPageContent {
  let jsonString = "";

  // Robust JSON extraction
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch?.[1]) {
    jsonString = codeBlockMatch[1];
  } else {
    const fallbackMatch = text.match(/(\{[\s\S]*\})/);
    if (fallbackMatch?.[0]) {
      jsonString = fallbackMatch[0];
    }
  }

  if (!jsonString) {
    throw new Error("No valid JSON object found in AI response.");
  }

  const parseResult = landingPageContentSchema.safeParse(
    JSON.parse(jsonString)
  );

  if (!parseResult.success) {
    console.error("AI response failed validation:", parseResult.error.format());
    throw new Error("Invalid content structure from AI after parsing.");
  }

  return parseResult.data;
}

function generateFallbackContent(startupTitle: string): LandingPageContent {
  return {
    headline: `${startupTitle}: Turn Your Vision Into Reality`,
    subheadline:
      "The fastest way to validate your startup idea and launch in days, not months",
    problemStatement:
      "Starting a business is overwhelming. You need validation, customers, and a clear path forward—but you don't know where to start.",
    solutionStatement:
      "Our platform provides a proven framework to validate your idea in 72 hours, build your MVP, and launch with confidence.",
    features: [
      {
        title: "72-Hour Validation",
        description:
          "Get real customer feedback fast with our proven validation framework. Know if your idea is worth building before you waste time and money.",
        icon: "⚡",
      },
      {
        title: "AI-Powered Guidance",
        description:
          "Get expert insights and recommendations at every step. It's like having a startup accelerator in your pocket, available 24/7.",
        icon: "🎯",
      },
      {
        title: "Launch-Ready Tools",
        description:
          "Everything you need to go from idea to launched product in days. No technical skills required—just your vision and determination.",
        icon: "🚀",
      },
    ],
    ctaText: "Start Free Trial",
    metaTitle: `${startupTitle} - Validate & Launch Your Startup Fast`,
    metaDescription:
      "Turn your startup idea into reality in 72 hours. Validate, build, and launch with our proven framework. Join successful founders today.",
  };
}

export function generateSlug(title: string): string {
  if (!title) return "";
  const lower = title.toLowerCase();
  const withHyphens = lower.replace(/[\s_:,]+/g, "-");
  const sanitized = withHyphens.replace(/[^a-z0-9-]/g, "");
  const singleHyphens = sanitized.replace(/-+/g, "-");
  const trimmed = singleHyphens.replace(/^-|-$/g, "");
  return trimmed.substring(0, 75);
}

export async function isSlugAvailable(
  slug: string,
  prisma: PrismaClient
): Promise<boolean> {
  const existing = await prisma.landingPage.findUnique({
    where: { slug },
  });
  return !existing;
}

export async function generateUniqueSlug(
  baseSlugInput: string,
  prisma: PrismaClient
): Promise<string> {
  const baseSlug = generateSlug(baseSlugInput);
  let slug = baseSlug;
  let counter = 1;

  while (!(await isSlugAvailable(slug, prisma))) {
    slug = `${baseSlug}-${counter}`;
    counter++;
    if (counter > 100) {
      console.warn("generateUniqueSlug reached max attempts for:", baseSlug);
      return `${baseSlug}-${Date.now()}`;
    }
  }

  return slug;
}
